import queryString from "query-string";
import { getBdauth, setBdauth } from "../libs/storage";
import {
  URL_BAIDU_WEB,
  URL_BAIDU_TRANSAPI_V2,
  URL_BAIDU_TRANSAPI,
  DEFAULT_USER_AGENT,
} from "../config";
import { fetchApi } from "../libs/fetch";

/* eslint-disable */
function n(t, e) {
  for (var n = 0; n < e.length - 2; n += 3) {
    var r = e.charAt(n + 2);
    (r = "a" <= r ? r.charCodeAt(0) - 87 : Number(r)),
      (r = "+" === e.charAt(n + 1) ? t >>> r : t << r),
      (t = "+" === e.charAt(n) ? (t + r) & 4294967295 : t ^ r);
  }
  return t;
}

function e(t, e) {
  (null == e || e > t.length) && (e = t.length);
  for (var n = 0, r = new Array(e); n < e; n++) r[n] = t[n];
  return r;
}

/* eslint-disable */
function getSign(t, gtk, r = null) {
  var o,
    i = t.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g);
  if (null === i) {
    var a = t.length;
    a > 30 &&
      (t = ""
        .concat(t.substr(0, 10))
        .concat(t.substr(Math.floor(a / 2) - 5, 10))
        .concat(t.substr(-10, 10)));
  } else {
    for (
      var s = t.split(/[\uD800-\uDBFF][\uDC00-\uDFFF]/),
        c = 0,
        u = s.length,
        l = [];
      c < u;
      c++
    )
      "" !== s[c] &&
        l.push.apply(
          l,
          (function (t) {
            if (Array.isArray(t)) return e(t);
          })((o = s[c].split(""))) ||
            (function (t) {
              if (
                ("undefined" != typeof Symbol && null != t[Symbol.iterator]) ||
                null != t["@@iterator"]
              )
                return Array.from(t);
            })(o) ||
            (function (t, n) {
              if (t) {
                if ("string" == typeof t) return e(t, n);
                var r = Object.prototype.toString.call(t).slice(8, -1);
                return (
                  "Object" === r && t.constructor && (r = t.constructor.name),
                  "Map" === r || "Set" === r
                    ? Array.from(t)
                    : "Arguments" === r ||
                      /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)
                    ? e(t, n)
                    : void 0
                );
              }
            })(o) ||
            (function () {
              throw new TypeError(
                "Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
              );
            })()
        ),
        c !== u - 1 && l.push(i[c]);
    var p = l.length;
    p > 30 &&
      (t =
        l.slice(0, 10).join("") +
        l.slice(Math.floor(p / 2) - 5, Math.floor(p / 2) + 5).join("") +
        l.slice(-10).join(""));
  }
  for (
    var d = ""
        .concat(String.fromCharCode(103))
        .concat(String.fromCharCode(116))
        .concat(String.fromCharCode(107)),
      h = (null !== r ? r : (r = gtk || "") || "").split("."),
      f = Number(h[0]) || 0,
      m = Number(h[1]) || 0,
      g = [],
      y = 0,
      v = 0;
    v < t.length;
    v++
  ) {
    var _ = t.charCodeAt(v);
    _ < 128
      ? (g[y++] = _)
      : (_ < 2048
          ? (g[y++] = (_ >> 6) | 192)
          : (55296 == (64512 & _) &&
            v + 1 < t.length &&
            56320 == (64512 & t.charCodeAt(v + 1))
              ? ((_ = 65536 + ((1023 & _) << 10) + (1023 & t.charCodeAt(++v))),
                (g[y++] = (_ >> 18) | 240),
                (g[y++] = ((_ >> 12) & 63) | 128))
              : (g[y++] = (_ >> 12) | 224),
            (g[y++] = ((_ >> 6) & 63) | 128)),
        (g[y++] = (63 & _) | 128));
  }
  for (
    var b = f,
      w =
        ""
          .concat(String.fromCharCode(43))
          .concat(String.fromCharCode(45))
          .concat(String.fromCharCode(97)) +
        ""
          .concat(String.fromCharCode(94))
          .concat(String.fromCharCode(43))
          .concat(String.fromCharCode(54)),
      k =
        ""
          .concat(String.fromCharCode(43))
          .concat(String.fromCharCode(45))
          .concat(String.fromCharCode(51)) +
        ""
          .concat(String.fromCharCode(94))
          .concat(String.fromCharCode(43))
          .concat(String.fromCharCode(98)) +
        ""
          .concat(String.fromCharCode(43))
          .concat(String.fromCharCode(45))
          .concat(String.fromCharCode(102)),
      x = 0;
    x < g.length;
    x++
  )
    b = n((b += g[x]), w);
  return (
    (b = n(b, k)),
    (b ^= m) < 0 && (b = 2147483648 + (2147483647 & b)),
    "".concat((b %= 1e6).toString(), ".").concat(b ^ f)
  );
}

const getToken = async () => {
  const res = await fetchApi({
    input: URL_BAIDU_WEB,
    init: {
      headers: {
        "Content-type": "text/html; charset=utf-8",
      },
    },
  });

  if (!res.ok) {
    throw new Error(res.statusText);
  }

  const text = await res.text();
  const token = text.match(/token: '(.*)',/)[1];
  const gtk = text.match(/gtk = "(.*)";/)[1];
  const exp = Date.now() + 8 * 60 * 60 * 1000;

  if (!token || !gtk) {
    throw new Error("[baidu] get token error");
  }

  return { token, gtk, exp };
};

/**
 * 闭包缓存token，减少对storage查询
 * @returns
 */
const _bdAuth = () => {
  let store;

  return async () => {
    const now = Date.now();

    // 查询内存缓存
    if (store && store.exp > now) {
      return store;
    }

    // 查询storage缓存
    store = await getBdauth();
    if (store && store.exp > now) {
      return store;
    }

    // 缓存没有或失效，查询接口
    store = await getToken();
    await setBdauth(store);
    return store;
  };
};

const bdAuth = _bdAuth();

/**
 * 失效作废
 * @param {*} param0
 * @returns
 */
export const genBaiduV2 = async ({ text, from, to }) => {
  const { token, gtk } = await bdAuth();
  const sign = getSign(text, gtk);
  const data = {
    from,
    to,
    query: text,
    simple_means_flag: 3,
    sign,
    token,
    domain: "common",
    ts: Date.now(),
  };

  const input = `${URL_BAIDU_TRANSAPI_V2}?from=${from}&to=${to}`;
  const init = {
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    method: "POST",
    body: queryString.stringify(data),
  };

  return [input, init];
};

export const genBaidu = async ({ text, from, to }) => {
  const data = {
    from,
    to,
    query: text,
    source: "txt",
  };

  const init = {
    headers: {
      // Origin: "https://fanyi.baidu.com",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    method: "POST",
    body: queryString.stringify(data),
  };

  return [URL_BAIDU_TRANSAPI, init];
};
