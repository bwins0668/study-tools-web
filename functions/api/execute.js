const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function executionResult(overrides = {}) {
  return {
    success: false,
    output: "",
    compileError: "",
    runtimeError: "",
    executionTimeMs: 0,
    error: "",
    ...overrides
  };
}

function executionError(message, status = 500, executionTimeMs = 0) {
  return json(executionResult({
    executionTimeMs,
    error: String(message || "服务器执行失败")
  }), status);
}

function stageFailed(stage) {
  return Boolean(stage && (
    stage.signal ||
    (typeof stage.code === "number" && stage.code !== 0)
  ));
}

function stageText(stage, fallback = "") {
  if (!stage) return fallback;
  return String(stage.stderr || stage.output || stage.stdout || fallback);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestPost(context) {
  try {
    const pistonBaseUrl = String(context.env?.PISTON_BASE_URL || "")
      .trim()
      .replace(/\/+$/, "");
    const pistonToken = String(context.env?.PISTON_TOKEN || "").trim();

    if (!pistonBaseUrl) {
      return executionError("远程代码执行服务尚未配置", 503);
    }

    const pistonHeaders = {
      ...(pistonToken ? { Authorization: `Bearer ${pistonToken}` } : {})
    };

    const body = await context.request.json();

    const language = String(body.language || "").toLowerCase();
    const code = String(body.code || "");
    const stdin = String(body.stdin || "");

    if (!["python", "java"].includes(language)) {
      return executionError("只支持 python / java", 400);
    }

    if (!code.trim()) {
      return executionError("代码不能为空", 400);
    }

    if (code.length > 20000) {
      return executionError("代码太长，Web公开版限制为 20000 字符以内", 400);
    }

    const runtimesRes = await fetch(`${pistonBaseUrl}/runtimes`, {
      headers: pistonHeaders
    });
    if (!runtimesRes.ok) {
      return executionError("无法获取代码运行环境", 502);
    }

    const runtimes = await runtimesRes.json();
    if (!Array.isArray(runtimes)) {
      return executionError("远程代码执行服务返回格式无效", 502);
    }

    const runtime = runtimes.find((rt) => {
      return rt.language === language || (Array.isArray(rt.aliases) && rt.aliases.includes(language));
    });

    if (!runtime) {
      return executionError(`服务器暂时没有可用的 ${language} 运行环境`, 502);
    }

    const filename = language === "java" ? "Main.java" : "main.py";

    const executeBody = {
      language: runtime.language,
      version: runtime.version,
      files: [
        {
          name: filename,
          content: code
        }
      ],
      stdin,
      compile_timeout: 10000,
      run_timeout: 3000
    };

    const executionStartedAt = Date.now();
    const execRes = await fetch(`${pistonBaseUrl}/execute`, {
      method: "POST",
      headers: {
        ...pistonHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(executeBody)
    });
    const executionTimeMs = Date.now() - executionStartedAt;

    const result = await execRes.json().catch(() => null);
    if (!execRes.ok) {
      return executionError(
        result?.message || result?.error || "远程代码执行服务请求失败",
        502,
        executionTimeMs
      );
    }

    if (!result || typeof result !== "object") {
      return executionError("远程代码执行服务返回格式无效", 502, executionTimeMs);
    }

    let compileError = stageFailed(result.compile)
      ? stageText(result.compile, "编译失败")
      : "";
    const runFailed = stageFailed(result.run);
    const runErrorText = runFailed ? stageText(result.run, "运行失败") : "";

    if (
      !compileError &&
      language === "python" &&
      /\b(?:SyntaxError|IndentationError|TabError)\b/.test(runErrorText)
    ) {
      compileError = runErrorText;
    }

    const runtimeError = !compileError && runFailed ? runErrorText : "";

    if (!compileError && !runtimeError && !result.run) {
      return executionError("远程代码执行服务返回格式无效", 502, executionTimeMs);
    }

    const output = result.run
      ? String(result.run.stdout ?? result.run.output ?? "")
      : "";

    return json(executionResult({
      success: !compileError && !runtimeError,
      output,
      compileError,
      runtimeError,
      executionTimeMs
    }));
  } catch (error) {
    return executionError(error.message || "服务器执行失败");
  }
}
