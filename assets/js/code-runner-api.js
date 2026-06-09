(() => {
  const endpoint = window.STUDY_TOOLS_API_BASE || "/api/execute";

  async function execute(language, code, stdin = "") {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        language,
        code,
        stdin
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || data.error || "代码执行失败");
    }

    return data;
  }

  window.WebCodeRunner = {
    runPython(code, stdin = "") {
      return execute("python", code, stdin);
    },

    runJava(code, stdin = "") {
      return execute("java", code, stdin);
    }
  };
})();
