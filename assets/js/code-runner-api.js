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
      throw new Error(data.message || data.error || "远程代码执行服务尚未配置 (404/Local Dev)");
    }

    return {
      success: data.success === true,
      output: String(data.output || ""),
      compileError: String(data.compileError || ""),
      runtimeError: String(data.runtimeError || ""),
      executionTimeMs: Number.isFinite(data.executionTimeMs)
        ? data.executionTimeMs
        : 0,
      error: String(data.error || "")
    };
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
