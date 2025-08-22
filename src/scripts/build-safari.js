import { $, globby } from "zx";
import path from "node:path";
import fs from "node:fs/promises";
import dotenv from "dotenv";
import { findUp } from "find-up";

async function main() {
  const rootPath = path.dirname(await findUp("package.json"));
  dotenv.config({ path: path.resolve(rootPath, ".env.local") });
  // https://github.com/vitejs/vite/issues/5885
  process.env.NODE_ENV = "production";

  const ProjectName = "Kiss Translator";
  const AppCategory = "public.app-category.productivity";
  const Identifier = "com.fishjar.kiss-translator";
  const DevelopmentTeam = process.env.DEVELOPMENT_TEAM;
  const DistPath = "build";

  await $`pnpm build:safari-output`;
  await $`xcrun safari-web-extension-converter --bundle-identifier ${Identifier} --force --project-location ${DistPath} build/safari`;
  async function updateProjectConfig() {
    const projectConfigPath = path.resolve(
      rootPath,
      `${DistPath}/${ProjectName}/${ProjectName}.xcodeproj/project.pbxproj`
    );
    const packageJson = JSON.parse(
      await fs.readFile(path.resolve(rootPath, "package.json"))
    );
    const content = await fs.readFile(projectConfigPath, "utf-8");
    const newContent = content
      .replaceAll(
        "MARKETING_VERSION = 1.0;",
        `MARKETING_VERSION = ${packageJson.version};`
      )
      .replace(
        new RegExp(
          `INFOPLIST_KEY_CFBundleDisplayName = ("?${ProjectName}"?);`,
          "g"
        ),
        `INFOPLIST_KEY_CFBundleDisplayName = $1;\n				INFOPLIST_KEY_LSApplicationCategoryType = "${AppCategory}";`
      )
      .replace(
        new RegExp(
          `INFOPLIST_KEY_CFBundleDisplayName = ("?${ProjectName}"?);`,
          "g"
        ),
        `INFOPLIST_KEY_CFBundleDisplayName = $1;\n				INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO;`
      )
      .replaceAll(
        `COPY_PHASE_STRIP = NO;`,
        DevelopmentTeam
          ? `COPY_PHASE_STRIP = NO;\n				DEVELOPMENT_TEAM = ${DevelopmentTeam};`
          : "COPY_PHASE_STRIP = NO;"
      )
      .replace(
        /CURRENT_PROJECT_VERSION = \d+;/g,
        `CURRENT_PROJECT_VERSION = ${parseProjectVersion(packageJson.version)};`
      );
    await fs.writeFile(projectConfigPath, newContent);
  }

  async function updateInfoPlist() {
    const projectPath = path.resolve(rootPath, DistPath, ProjectName);
    const files = await globby("**/*.plist", {
      cwd: projectPath,
    });
    for (const file of files) {
      const content = await fs.readFile(
        path.resolve(projectPath, file),
        "utf-8"
      );
      await fs.writeFile(
        path.resolve(projectPath, file),
        content.replaceAll(
          "</dict>\n</plist>",
          "	<key>CFBundleVersion</key>\n	<string>$(CURRENT_PROJECT_VERSION)</string>\n</dict>\n</plist>"
        )
      );
    }
  }

  function parseProjectVersion(version) {
    const [major, minor, patch] = version.split(".").map(Number);
    return major * 10000 + minor * 100 + patch;
  }

  await updateProjectConfig();
  await updateInfoPlist();
}

main();
