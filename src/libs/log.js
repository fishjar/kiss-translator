// 定义日志级别
export const LogLevel = {
  DEBUG: { value: 0, name: "DEBUG", color: "#6495ED" }, // 宝蓝色
  INFO: { value: 1, name: "INFO", color: "#4CAF50" }, // 绿色
  WARN: { value: 2, name: "WARN", color: "#FFC107" }, // 琥珀色
  ERROR: { value: 3, name: "ERROR", color: "#F44336" }, // 红色
  SILENT: { value: 4, name: "SILENT" }, // 特殊级别，用于关闭所有日志
};

function findLogLevelByValue(value) {
  return Object.values(LogLevel).find((level) => level.value === value);
}

function findLogLevelByName(name) {
  if (typeof name !== "string" || name.length === 0) return undefined;
  const upperCaseName = name.toUpperCase();
  return Object.values(LogLevel).find((level) => level.name === upperCaseName);
}

class Logger {
  /**
   * @param {object} [options={}] 配置选项
   * @param {LogLevel} [options.level=LogLevel.INFO]  要显示的最低日志级别
   * @param {string}   [options.prefix='App']         日志前缀，用于区分模块
   */
  constructor(options = {}) {
    this.config = {
      level: options.level || LogLevel.INFO,
      prefix: options.prefix || "KISS-Translator",
    };
  }

  /**
   * 动态设置日志级别
   * @param {LogLevel} level - 新的日志级别
   */
  setLevel(level) {
    let newLevelObject;

    if (typeof level === "string") {
      newLevelObject = findLogLevelByName(level);
      if (!newLevelObject) {
        this.warn(
          `Invalid log level name provided: "${level}". Keeping current level.`
        );
        return;
      }
    } else if (typeof level === "number") {
      newLevelObject = findLogLevelByValue(level);
      if (!newLevelObject) {
        this.warn(
          `Invalid log level value provided: ${level}. Keeping current level.`
        );
        return;
      }
    } else if (level && typeof level.value === "number") {
      newLevelObject = level;
    } else {
      this.warn(
        "Invalid argument passed to setLevel. Must be a LogLevel object, number, or string."
      );
      return;
    }

    this.config.level = newLevelObject;
    console.log(
      `[${this.config.prefix}] Log level dynamically set to ${this.config.level.name}`
    );
  }

  /**
   * 核心日志记录方法
   * @private
   * @param {LogLevel} level - 当前消息的日志级别
   * @param {...any} args - 要记录的多个参数，可以是任何类型
   */
  _log(level, ...args) {
    // 如果当前级别低于配置的最低级别，则不打印
    if (level.value < this.config.level.value) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefixStr = `[${this.config.prefix}]`;
    const levelStr = `[${level.name}]`;

    // 判断是否在浏览器环境并且浏览器支持 console 样式
    const isBrowser =
      typeof window !== "undefined" && typeof window.document !== "undefined";

    if (isBrowser) {
      // 在浏览器中使用颜色高亮
      const consoleMethod = this._getConsoleMethod(level);
      consoleMethod(
        `%c${timestamp} %c${prefixStr} %c${levelStr}`,
        "color: gray; font-weight: lighter;", // 时间戳样式
        "color: #7c57e0; font-weight: bold;", // 前缀样式 (紫色)
        `color: ${level.color}; font-weight: bold;`, // 日志级别样式
        ...args
      );
    } else {
      // 在 Node.js 或不支持样式的环境中，输出纯文本
      const consoleMethod = this._getConsoleMethod(level);
      consoleMethod(timestamp, prefixStr, levelStr, ...args);
    }
  }

  /**
   * 根据日志级别获取对应的 console 方法
   * @private
   */
  _getConsoleMethod(level) {
    switch (level) {
      case LogLevel.ERROR:
        return console.error;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.INFO:
        return console.info;
      default:
        return console.log;
    }
  }

  /**
   * 记录 DEBUG 级别的日志
   * @param {...any} args
   */
  debug(...args) {
    this._log(LogLevel.DEBUG, ...args);
  }

  /**
   * 记录 INFO 级别的日志
   * @param {...any} args
   */
  info(...args) {
    this._log(LogLevel.INFO, ...args);
  }

  /**
   * 记录 WARN 级别的日志
   * @param {...any} args
   */
  warn(...args) {
    this._log(LogLevel.WARN, ...args);
  }

  /**
   * 记录 ERROR 级别的日志
   * @param {...any} args
   */
  error(...args) {
    this._log(LogLevel.ERROR, ...args);
  }
}

export const logger = new Logger();
export const kissLog = logger.info.bind(logger);

// todo：debug日志埋点
