import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const GLOSSARY_API_URL =
  "https://api.github.com/repos/arstgit/high-frequency-vocabulary/contents/30k-explained.txt";
const WORDS_URL =
  "https://cdn.jsdelivr.net/gh/Maximax67/Words-CEFR-Dataset@main/csv/words.csv";
const WORD_POS_URL =
  "https://cdn.jsdelivr.net/gh/Maximax67/Words-CEFR-Dataset@main/csv/word_pos.csv";
const OUTPUT_PATH = path.resolve(process.cwd(), "public/assets/cefr_dict.json");
const TARGET_ENTRY_COUNT = 30000;
const CANDIDATE_WORD_LIMIT = 31000;
const CEFR_LABELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function log(message) {
  console.log(`[build-cefr-dict] ${message}`);
}

async function fetchGitHubBlobContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const metadata = await response.json();
  const blobResponse = await fetch(metadata.git_url);
  if (!blobResponse.ok) {
    throw new Error(`Failed to fetch ${metadata.git_url}: ${blobResponse.status}`);
  }

  const blob = await blobResponse.json();
  return Buffer.from(blob.content, blob.encoding).toString("utf8");
}

async function fetchText(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      return response.text();
    } catch (error) {
      if (attempt === 2) {
        break;
      }

      await sleep(250 * (attempt + 1));
    }
  }

  return execFileSync(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", url],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
    }
  );
}

function parseDelimitedText(text, delimiter, onRow) {
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      field = "";
      const shouldContinue = onRow(row);
      row = [];
      if (shouldContinue === false) {
        return;
      }
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    onRow(row);
  }
}

function normalizeWord(word = "") {
  return String(word).trim().toLowerCase();
}

function scoreToLevel(score) {
  const normalized = Math.min(6, Math.max(1, Math.round(score)));
  return CEFR_LABELS[normalized - 1];
}

function stripLeadingLabels(text) {
  return text
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(
      /^(?:(?:n|v|vi|vt|adj|adv|prep|pron|conj|int|aux|art|det|num|abbr)\.\s*)+/gi,
      ""
    );
}

function normalizeGloss(rawGloss = "") {
  const candidate = stripLeadingLabels(String(rawGloss).trim())
    .split(/,(?=(?:n|v|vi|vt|adj|adv|prep|pron|conj|int|aux|art|det|num|abbr)\.)/i)[0]
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!candidate) {
    return "";
  }

  if (candidate.length > 18 && candidate.includes("；")) {
    return candidate.split("；")[0].trim();
  }

  return candidate;
}

async function collectGlossaryData() {
  log("Fetching explained glossary...");
  const glossaryText = await fetchGitHubBlobContent(GLOSSARY_API_URL);
  const glossesByWord = new Map();

  let currentWord = "";
  let currentEntryLines = [];

  const flushCurrentEntry = () => {
    if (!currentWord || glossesByWord.has(currentWord)) {
      currentEntryLines = [];
      return;
    }

    for (let index = currentEntryLines.length - 1; index >= 0; index -= 1) {
      const gloss = normalizeGloss(currentEntryLines[index]);
      if (gloss) {
        glossesByWord.set(currentWord, gloss);
        break;
      }
    }

    currentEntryLines = [];
  };

  glossaryText.split(/\n/).forEach((line) => {
    const match = line.trim().match(/^([A-Za-z]+)\s+\d+$/);
    if (match) {
      flushCurrentEntry();
      currentWord = normalizeWord(match[1]);
      return;
    }

    if (currentWord) {
      currentEntryLines.push(line);
    }
  });
  flushCurrentEntry();

  log(`Collected ${glossesByWord.size} glossary entries with Chinese glosses.`);
  return glossesByWord;
}

async function collectCandidateWords() {
  log("Fetching frequency-ranked words...");
  const wordsText = await fetchText(WORDS_URL);
  const orderedWords = [];
  const wordIdsByWord = new Map();
  let isHeader = true;

  parseDelimitedText(wordsText, ",", (row) => {
    if (isHeader) {
      isHeader = false;
      return true;
    }

    const word = normalizeWord(row[1]);
    if (!/^[a-z]+$/.test(word) || wordIdsByWord.has(word)) {
      return true;
    }

    wordIdsByWord.set(word, row[0]);
    orderedWords.push(word);
    return orderedWords.length < CANDIDATE_WORD_LIMIT;
  });

  log(`Collected ${orderedWords.length} candidate words from the CEFR frequency list.`);
  return { orderedWords, wordIdsByWord };
}

async function collectLevels(wordIdsByWord) {
  log("Fetching CEFR word scores...");
  const wordPosText = await fetchText(WORD_POS_URL);
  const targetWordById = new Map(
    Array.from(wordIdsByWord.entries(), ([word, wordId]) => [wordId, word])
  );
  const aggregates = new Map();
  let isHeader = true;

  parseDelimitedText(wordPosText, ",", (row) => {
    if (isHeader) {
      isHeader = false;
      return true;
    }

    const word = targetWordById.get(row[1]);
    if (!word) {
      return true;
    }

    const level = Number(row[5]);
    if (!Number.isFinite(level) || level <= 0) {
      return true;
    }

    const frequency = Math.max(Number(row[4]) || 1, 1);
    const aggregate = aggregates.get(word) || { sum: 0, weight: 0 };
    aggregate.sum += level * frequency;
    aggregate.weight += frequency;
    aggregates.set(word, aggregate);
    return true;
  });

  const levelsByWord = new Map();
  aggregates.forEach((aggregate, word) => {
    if (!aggregate.weight) return;
    levelsByWord.set(word, scoreToLevel(aggregate.sum / aggregate.weight));
  });

  log(`Resolved CEFR levels for ${levelsByWord.size} candidate words.`);
  return levelsByWord;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractYoudaoGloss(payload) {
  const exactGlosses = payload?.ec?.word?.trs?.map((item) =>
    normalizeGloss(item?.tran || "")
  );
  const exact = exactGlosses?.find(Boolean);
  if (exact) return exact;

  const webTranslations = payload?.web_trans?.["web-translation"] || [];
  for (const item of webTranslations) {
    for (const trans of item?.trans || []) {
      const gloss = normalizeGloss(trans?.value || "");
      if (gloss) return gloss;
    }
  }

  return "";
}

async function fetchYoudaoGloss(word) {
  const params = new URLSearchParams({
    doctype: "json",
    jsonversion: "4",
  });
  const body = new URLSearchParams({
    q: word,
    le: "en",
    t: "3",
    client: "web",
    keyfrom: "webdict",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://dict.youdao.com/jsonapi_s?${params.toString()}`,
        {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            "accept-language":
              "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        }
      );

      if (!response.ok) {
        throw new Error(`Youdao responded with ${response.status}`);
      }

      const payload = await response.json();
      return extractYoudaoGloss(payload);
    } catch (error) {
      if (attempt === 2) {
        return "";
      }

      await sleep(150 * (attempt + 1));
    }
  }

  return "";
}

async function fillMissingGlosses(words, glossesByWord) {
  const missingWords = words.filter((word) => !glossesByWord.has(word));
  if (missingWords.length === 0) {
    return glossesByWord;
  }

  log(`Filling ${missingWords.length} missing glosses from Youdao...`);
  const concurrency = 12;
  let cursor = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < missingWords.length) {
        const index = cursor;
        cursor += 1;
        const word = missingWords[index];
        const gloss = await fetchYoudaoGloss(word);
        if (gloss) {
          glossesByWord.set(word, gloss);
        }

        completed += 1;
        if (completed % 200 === 0 || completed === missingWords.length) {
          log(`Youdao fallback progress: ${completed}/${missingWords.length}`);
        }
      }
    })
  );

  return glossesByWord;
}

async function buildDictionary() {
  const glossesByWord = await collectGlossaryData();
  const { orderedWords, wordIdsByWord } = await collectCandidateWords();
  const levelsByWord = await collectLevels(wordIdsByWord);
  await fillMissingGlosses(orderedWords, glossesByWord);

  const dictionary = {};
  let entryCount = 0;

  orderedWords.forEach((word) => {
    if (entryCount >= TARGET_ENTRY_COUNT) {
      return;
    }

    const level = levelsByWord.get(word);
    const zh = glossesByWord.get(word);
    if (!level || !zh) return;

    dictionary[word] = { level, zh };
    entryCount += 1;
  });

  if (entryCount < TARGET_ENTRY_COUNT) {
    throw new Error(
      `Only generated ${entryCount} entries, expected at least ${TARGET_ENTRY_COUNT}.`
    );
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(dictionary)}\n`);
  log(`Wrote ${entryCount} entries to ${OUTPUT_PATH}.`);
}

buildDictionary().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
