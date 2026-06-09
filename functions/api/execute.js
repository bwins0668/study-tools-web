const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const PISTON_BASE = "https://emkc.org/api/v2/piston";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const language = String(body.language || "").toLowerCase();
    const code = String(body.code || "");
    const stdin = String(body.stdin || "");

    if (!["python", "java"].includes(language)) {
      return json({ message: "只支持 python / java" }, 400);
    }

    if (!code.trim()) {
      return json({ message: "代码不能为空" }, 400);
    }

    if (code.length > 20000) {
      return json({ message: "代码太长，Web公开版限制为 20000 字符以内" }, 400);
    }

    const runtimesRes = await fetch(`${PISTON_BASE}/runtimes`);
    if (!runtimesRes.ok) {
      return json({ message: "无法获取代码运行环境" }, 502);
    }

    const runtimes = await runtimesRes.json();

    const runtime = runtimes.find((rt) => {
      return rt.language === language || (Array.isArray(rt.aliases) && rt.aliases.includes(language));
    });

    if (!runtime) {
      return json({ message: `服务器暂时没有可用的 ${language} 运行环境` }, 502);
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

    const execRes = await fetch(`${PISTON_BASE}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(executeBody)
    });

    const result = await execRes.json();

    return json({
      language,
      runtime,
      result
    }, execRes.ok ? 200 : 502);
  } catch (error) {
    return json({
      message: error.message || "服务器执行失败"
    }, 500);
  }
}
