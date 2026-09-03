import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const base = env.DOKPLOY_URL.replace(/\/$/, "");
const headers = {
  "x-api-key": env.DOKPLOY_API_KEY,
  "content-type": "application/json",
};

const call = async (method, path, body, ms = 20000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
};

const action = process.argv[2];
const postgresId =
  process.argv[3] ||
  (fs.existsSync("scripts/.dokploy-postgres-id")
    ? fs.readFileSync("scripts/.dokploy-postgres-id", "utf8").trim()
    : "S0RI_uahCxyiPRPpWpHK_");

if (action === "one") {
  const result = await call("GET", `/api/postgres.one?postgresId=${postgresId}`, null, 15000);
  console.log("status", result.status);
  const p = result.json;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    console.log(
      JSON.stringify(
        {
          postgresId: p.postgresId,
          name: p.name,
          appName: p.appName,
          applicationStatus: p.applicationStatus,
          databaseName: p.databaseName,
          databaseUser: p.databaseUser,
          dockerImage: p.dockerImage,
          externalPort: p.externalPort,
          environmentId: p.environmentId,
          hasPassword: Boolean(p.databasePassword),
        },
        null,
        2
      )
    );
  } else {
    console.log(String(result.json).slice(0, 2000));
  }
} else if (action === "deploy") {
  const result = await call("POST", "/api/postgres.deploy", { postgresId }, 60000);
  console.log("status", result.status);
  console.log(typeof result.json === "string" ? result.json.slice(0, 2000) : JSON.stringify(result.json).slice(0, 2000));
} else if (action === "port") {
  const result = await call("POST", "/api/postgres.saveExternalPort", { postgresId, externalPort: 5433 }, 20000);
  console.log("status", result.status);
  console.log(typeof result.json === "string" ? result.json.slice(0, 2000) : JSON.stringify(result.json).slice(0, 2000));
} else if (action === "create") {
  const password = env.DOKPLOY_PG_PASSWORD;
  if (!password) {
    throw new Error("DOKPLOY_PG_PASSWORD missing");
  }
  const result = await call(
    "POST",
    "/api/postgres.create",
    {
      name: "myhero-console",
      appName: "myhero-console-pg",
      databaseName: "myhero",
      databaseUser: "myhero",
      databasePassword: password,
      dockerImage: "postgres:16",
      environmentId: "VjiyrCeP0YUG6-s9OkshK",
      description: "USB bench kiosk ledger",
    },
    30000
  );
  console.log("status", result.status);
  const p = result.json;
  console.log(
    typeof p === "object"
      ? JSON.stringify(
          {
            postgresId: p.postgresId,
            name: p.name,
            appName: p.appName,
            applicationStatus: p.applicationStatus,
          },
          null,
          2
        )
      : String(p).slice(0, 2000)
  );
} else if (action === "remove") {
  const result = await call("POST", "/api/postgres.remove", { postgresId }, 30000);
  console.log("status", result.status);
  console.log(typeof result.json === "string" ? result.json.slice(0, 2000) : JSON.stringify(result.json).slice(0, 2000));
} else {
  throw new Error("usage: one|deploy|port|create|remove");
}
