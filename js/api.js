/* ============================================================
 * 椅座·红乡 · 前端 API 层
 * 作用：对接后端 REST 接口（Servlet + JDBC + MySQL）。
 *       启动时从服务端拉取内容；服务端不可达时用 data.js 兜底，
 *       并在界面提示先启动后端。
 * 由 index.html 在 app.js 之前加载；boot 完成后注入 app.js。
 * ============================================================ */
(function () {
  "use strict";

  // 后端地址：可被全局覆盖（如部署到不同端口时设置 window.RRX_API_BASE）
  var BASE = (window.RRX_API_BASE || "http://localhost:8080");

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {}
    );
    if (opts.token) opts.headers["Authorization"] = "Bearer " + opts.token;
    return fetch(BASE + path, opts).then(function (r) {
      return r.json().catch(function () { return { error: "响应解析失败" }; })
        .then(function (data) {
          if (!r.ok) {
            // 需要鉴权的请求返回 401：token 已失效，清掉并广播，供界面提示重新登录
            if (r.status === 401 && opts.token) {
              setToken("");
              try { window.dispatchEvent(new CustomEvent("rrx:unauthorized")); } catch (e) {}
            }
            var e = new Error(data && data.error || ("HTTP " + r.status)); e.data = data; throw e;
          }
          return data;
        });
    });
  }

  var tokenStoreKey = "rrx_token_v2";
  function getToken() { try { return localStorage.getItem(tokenStoreKey) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { if (t) localStorage.setItem(tokenStoreKey, t); else localStorage.removeItem(tokenStoreKey); } catch (e) {} }

  var API = {
    base: BASE,

    // ---- 内容 ----
    fetchContent: function () { return api("/api/content"); },

    // ---- 认证 ----
    register: function (phone, password, nickname) {
      return api("/api/auth/register", { method: "POST", body: JSON.stringify({ phone: phone, password: password, nickname: nickname }) });
    },
    login: function (phone, password) {
      return api("/api/auth/login", { method: "POST", body: JSON.stringify({ phone: phone, password: password }) });
    },
    logout: function () { setToken(""); },
    me: function () { return api("/api/auth/me", { token: getToken() }); },

    // ---- 进度（保存到服务端） ----
    getProgress: function () { return api("/api/progress", { token: getToken() }); },
    saveLineProgress: function (lineId, payload) {
      return api("/api/progress", {
        method: "PUT", token: getToken(),
        body: JSON.stringify({ lineId: lineId, payload: payload })
      });
    },

    // ---- 报告 ----
    saveReport: function (name, content) {
      return api("/api/report", { method: "POST", token: getToken(), body: JSON.stringify({ name: name, content: content }) });
    },
    listReports: function () { return api("/api/report", { token: getToken() }); },

    // ---- 文旅 / 产业 ----
    routes: function (line) { return api("/api/routes" + (line ? ("?line=" + line) : "")); },
    agri: function (line) { return api("/api/agri" + (line ? ("?line=" + line) : "")); },

    token: getToken,
    setToken: setToken,
    isLoggedIn: function () { return !!getToken(); }
  };

  window.RRX_API = API;

  /**
   * 启动内容引导：从后端拉取内容并覆盖 window.RRX；
   * 失败时沿用 data.js 兜底内容。返回 Promise。
   */
  function boot() {
    // 演示模式（静态部署 / ?demo=1 / file://）：不请求后端，直接使用 data.js 全量内容
    if (window.RRX_DEMO) {
      var d = window.RRX || {};
      d.SERVER_MODE = false;
      d.DEMO = true;
      window.RRX = d;
      return Promise.resolve({ server: false, demo: true });
    }
    return API.fetchContent().then(function (data) {
      if (data && data.serverMode) {
        var base = window.RRX || {};
        // 保留本地存储键，其余用服务端内容覆盖
        var merged = {
          SOURCES: data.sources || base.SOURCES || {},
          CHAIRS: data.chairs || base.CHAIRS || [],
          QUIZZES: data.quizzes || base.QUIZZES || [],
          SORTS: data.sorts || base.SORTS || [],
          OPENS: data.opens || base.OPENS || [],
          ROUTES: data.routes || base.ROUTES || [],
          AGRI: data.agri || base.AGRI || [],
          STORE_KEY: base.STORE_KEY || "chairRedStudy_v2",
          STORE_VER: base.STORE_VER || 2,
          SERVER_MODE: true
        };
        window.RRX = merged;
        return { server: true };
      }
      return { server: false };
    }).catch(function () {
      // 后端不可达：保留 data.js 兜底内容
      var base = window.RRX || {};
      if (base) base.SERVER_MODE = false;
      return { server: false };
    });
  }

  window.RRX_BOOT = boot;
})();
