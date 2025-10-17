const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const __dirnameResolved = __dirname || path.resolve();
const PUBLIC_DIR = __dirnameResolved;
const DATA_DIR = path.join(__dirnameResolved, "data");
const CHECKLIST_FILE = path.join(DATA_DIR, "checklist.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = parsedUrl;

    if (pathname === "/api/checklist" && req.method === "GET") {
      return serveChecklist(res);
    }

    if (pathname === "/api/state") {
      if (req.method === "GET") {
        return serveState(res);
      }
      if (req.method === "POST") {
        return handleStateSave(req, res);
      }
    }

    if (req.method === "GET") {
      return serveStatic(pathname, res);
    }

    notFound(res);
  } catch (error) {
    console.error("Unhandled error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
});

server.listen(PORT, () => {
  console.log(`✔ 온비드 일일점검 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }

  if (!fs.existsSync(CHECKLIST_FILE)) {
    const defaultChecklist = buildDefaultChecklist();
    fs.writeFileSync(
      CHECKLIST_FILE,
      JSON.stringify(defaultChecklist, null, 2),
      "utf-8"
    );
  }

  if (!fs.existsSync(STATE_FILE)) {
    const defaultState = {
      items: {},
      notes: {},
      inspectors: [],
      metadata: {
        updatedAt: null
      }
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2), "utf-8");
  }
}

function serveChecklist(res) {
  try {
    const checklist = fs.readFileSync(CHECKLIST_FILE, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(checklist);
  } catch (error) {
    console.error("Failed to load checklist:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(JSON.stringify({ error: "Failed to load checklist data" }));
  }
}

function serveState(res) {
  try {
    const state = fs.readFileSync(STATE_FILE, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(state);
  } catch (error) {
    console.error("Failed to load state:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(JSON.stringify({ error: "Failed to load saved state" }));
  }
}

function handleStateSave(req, res) {
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString("utf-8");
      const payload = JSON.parse(body);
      const stateToSave = {
        items: payload.items ?? {},
        notes: payload.notes ?? {},
        inspectors: Array.isArray(payload.inspectors)
          ? payload.inspectors
          : [],
        metadata: {
          updatedAt: new Date().toISOString()
        }
      };

      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify(stateToSave, null, 2),
        "utf-8"
      );

      res.statusCode = 200;
      res.setHeader("Content-Type", MIME_TYPES[".json"]);
      res.end(JSON.stringify(stateToSave));
    } catch (error) {
      console.error("Failed to save state:", error);
      res.statusCode = 400;
      res.setHeader("Content-Type", MIME_TYPES[".json"]);
      res.end(JSON.stringify({ error: "Invalid payload" }));
    }
  });
  req.on("error", error => {
    console.error("Request error:", error);
    res.statusCode = 400;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(JSON.stringify({ error: "Failed to read request" }));
  });
}

function serveStatic(requestPath, res) {
  let filePath = requestPath;

  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  // prevent path traversal
  const normalizedPath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", MIME_TYPES[".json"]);
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  fs.readFile(absolutePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        notFound(res);
      } else {
        console.error("Static file error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", MIME_TYPES[".json"]);
        res.end(JSON.stringify({ error: "Failed to serve file" }));
      }
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", MIME_TYPES[".json"]);
  res.end(JSON.stringify({ error: "Not Found" }));
}

function buildDefaultChecklist() {
  return [
    {
      sectionId: "section1",
      title: "1. 모니터링 솔루션(JENNIFER)",
      groups: [
        {
          groupId: "section1-group1",
          title: "1-1. 액티브 서비스",
          type: "grid",
          cornerHeader: "",
          columns: ["SP", "IM", "OP", "MO", "RD", "FI", "TM", "BA", "CAO"],
          rows: [
            { rowId: "exception", label: "특이사항 여부" },
            { rowId: "cpu", label: "CPU 사용률 이상여부" }
          ]
        },
        {
          groupId: "section1-group2",
          title: "1-2. 기타 특이사항",
          type: "notes"
        }
      ]
    },
    {
      sectionId: "section2",
      title: "2. 연계솔루션(eCross)",
      groups: [
        {
          groupId: "section2-group1",
          title: "2-1. 서버별 전문상태",
          type: "grid",
          cornerHeader: "",
          columns: [
            "ONTRS",
            "EXTRS",
            "NASVR",
            "PITRS",
            "MOEHR",
            "PPSPR",
            "DITRS",
            "VOC SVR"
          ],
          rows: [{ rowId: "exception", label: "특이사항 여부" }]
        },
        {
          groupId: "section2-group2",
          title: "2-2. 기타 특이사항",
          type: "notes"
        }
      ]
    },
    {
      sectionId: "section3",
      title: "3. 시스템 기타 특이사항",
      groups: [
        {
          groupId: "section3-group1",
          title: "3-1. 통합 점검",
          type: "grid",
          cornerHeader: "",
          columns: ["점검"],
          rows: [{ rowId: "exception", label: "특이사항 여부" }]
        },
        {
          groupId: "section3-group2",
          title: "3-2. 기타 특이사항",
          type: "notes"
        }
      ]
    }
  ];
}
