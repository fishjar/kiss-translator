import { getMsgHistory, clearMsgHistory } from "./history";

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

describe("MsgHistory addPair", () => {
  // 实例容量在首次创建后锁存（getMsgHistory 忽略同 slug 的第二次 maxSize），
  // 每个用例使用独立 slug，避免跨用例假红/假绿。
  const usedSlugs = [];
  const makeHistory = (maxSize) => {
    const slug = `addpair-test-${usedSlugs.length}`;
    usedSlugs.push(slug);
    return getMsgHistory(slug, maxSize);
  };

  afterEach(() => {
    usedSlugs.forEach((slug) => clearMsgHistory(slug));
    usedSlugs.length = 0;
  });

  test("空历史写入一对 → [user, assistant]", () => {
    const history = makeHistory(10);
    history.addPair(user("u1"), assistant("a1"));
    expect(history.getAll()).toEqual([user("u1"), assistant("a1")]);
  });

  test("maxSize=3 两轮 → 只留最新一对（奇数容量向下取整轮）", () => {
    const history = makeHistory(3);
    history.addPair(user("u1"), assistant("a1"));
    history.addPair(user("u2"), assistant("a2"));
    expect(history.getAll()).toEqual([user("u2"), assistant("a2")]);
  });

  test("偶数容量 maxSize=4 → 保留两对，最旧完整对先删", () => {
    const history = makeHistory(4);
    history.addPair(user("u1"), assistant("a1"));
    history.addPair(user("u2"), assistant("a2"));
    history.addPair(user("u3"), assistant("a3"));
    expect(history.getAll()).toEqual([
      user("u2"),
      assistant("a2"),
      user("u3"),
      assistant("a3"),
    ]);
  });

  test("干净前缀尾部孤立 user → 丢弃后追加，不以孤立 assistant 开头", () => {
    const history = makeHistory(10);
    history.add(user("u1"), assistant("a1"), user("u2"));
    history.addPair(user("u3"), assistant("a3"));
    expect(history.getAll()).toEqual([
      user("u1"),
      assistant("a1"),
      user("u3"),
      assistant("a3"),
    ]);
  });

  test("maxSize=1 no-op：不写入、不报错，预置头部孤立 assistant 仍被清理", () => {
    const history = makeHistory(1);
    history.add(assistant("孤儿"));
    history.addPair(user("u1"), assistant("a1"));
    expect(history.getAll()).toEqual([]);
  });

  test("maxSize=0 no-op：列表恒空，与旧 add 的恒空语义观测等价", () => {
    // 「maxSize=0 + 预置头部孤儿」经公开 API 不可构造：add 在 maxSize=0 实例上
    // push 后立即被 splice 清空（history.js add 逐条截断），messages 闭包私有、
    // 容量锁存不可变更。本用例只钉空列表 no-op 不抛错；maxSize=1 × 孤儿另有用例。
    const history = makeHistory(0);
    history.addPair(user("u1"), assistant("a1"));
    expect(history.getAll()).toEqual([]);
  });

  test("遗留逐条截断稳态头部孤立 assistant [a,u,a] → 清理后按干净路径追加", () => {
    const history = makeHistory(3);
    history.add(assistant("a0"), user("u1"), assistant("a1"));
    history.addPair(user("u2"), assistant("a2"));
    expect(history.getAll()).toEqual([user("u2"), assistant("a2")]);
  });

  test("头部连续多个孤立 assistant → 全部丢弃", () => {
    const history = makeHistory(10);
    history.add(assistant("x"), assistant("y"), user("u1"), assistant("a1"));
    history.addPair(user("u2"), assistant("a2"));
    expect(history.getAll()).toEqual([
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
  });

  test("污染历史走逐条回退：追加成功、既有条目不改写、长度有界", () => {
    const history = makeHistory(3);
    const kept = assistant("a1");
    history.add(user("u1"), { type: "thought", text: "t" }, kept);
    history.addPair(user("u2"), assistant("a2"));
    const all = history.getAll();
    expect(all).toHaveLength(3);
    // 头部逐条截断镜像 add 语义；保留下来的旧条目是原对象引用，未被改写
    expect(all[0]).toBe(kept);
    expect(all).toEqual([assistant("a1"), user("u2"), assistant("a2")]);
  });

  test("污染回退遗留的头部孤立 assistant → 下一轮 addPair 自愈", () => {
    const history = makeHistory(3);
    history.add(user("u1"), { type: "thought" }, assistant("a1"));
    history.addPair(user("u2"), assistant("a2"));
    expect(history.getAll()).toEqual([
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
    history.addPair(user("u3"), assistant("a3"));
    expect(history.getAll()).toEqual([user("u3"), assistant("a3")]);
  });

  test("role 交替但 content 非字符串的历史 → 走干净快路径，不清洗条目", () => {
    const history = makeHistory(4);
    const weirdUser = { role: "user", content: { parts: ["x"] } };
    const weirdAssistant = { role: "assistant", content: null };
    history.add(weirdUser, weirdAssistant);
    history.addPair(user("u2"), assistant("a2"));
    expect(history.getAll()).toEqual([
      weirdUser,
      weirdAssistant,
      user("u2"),
      assistant("a2"),
    ]);
  });

  test("assistantMsg 携带额外字段 → 仅持久化 {role, content} 两字段", () => {
    const history = makeHistory(10);
    history.addPair(user("u1"), {
      role: "assistant",
      content: "a1",
      reasoning_content: "思考过程",
      tool_calls: [{ id: "t" }],
    });
    expect(history.getAll()).toEqual([
      user("u1"),
      { role: "assistant", content: "a1" },
    ]);
  });

  test.each([
    ["userMsg 缺失", null, assistant("a")],
    ["role 非 assistant", user("u"), { role: "model", content: "a" }],
    ["role 缺失", user("u"), { content: "a" }],
    ["content 空串", user("u"), assistant("")],
    ["content 非字符串", user("u"), assistant(null)],
  ])("守卫失败分支：%s → 整对不写且不改既有列表", (_name, u, a) => {
    const history = makeHistory(10);
    history.add(user("旧"), assistant("历史"));
    const before = history.getAll();
    history.addPair(u, a);
    expect(history.getAll()).toEqual(before);
  });

  test("守卫失败 + 预置头部孤儿 → 整对不写、孤儿原样留存（守卫先于头部修复）", () => {
    const history = makeHistory(10);
    const orphan = assistant("孤儿");
    history.add(orphan);
    // content 空串：守卫失败分支。若实现把头部修复误置于守卫之前，孤儿会被清掉、本用例炸红。
    history.addPair(user("u1"), assistant(""));
    const all = history.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(orphan);
  });
});
