// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";
var MemStorage = class {
  airports;
  sessions;
  constructor() {
    this.airports = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Map();
    this.initializeAirports();
  }
  initializeAirports() {
    const airportData = [
      { iataCode: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States", latitude: "40.6413", longitude: "-73.7781" },
      { iataCode: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "United States", latitude: "33.9416", longitude: "-118.4085" },
      { iataCode: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", latitude: "51.4700", longitude: "-0.4543" },
      { iataCode: "CDG", name: "Charles de Gaulle Airport", city: "Paris", country: "France", latitude: "49.0097", longitude: "2.5479" },
      { iataCode: "NRT", name: "Narita International Airport", city: "Tokyo", country: "Japan", latitude: "35.7720", longitude: "140.3929" },
      { iataCode: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", latitude: "25.2532", longitude: "55.3657" },
      { iataCode: "SIN", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", latitude: "1.3644", longitude: "103.9915" },
      { iataCode: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong", latitude: "22.3080", longitude: "113.9185" },
      { iataCode: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia", latitude: "-33.9399", longitude: "151.1753" },
      { iataCode: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", latitude: "50.0379", longitude: "8.5622" }
    ];
    airportData.forEach((data) => {
      const id = randomUUID();
      this.airports.set(data.iataCode, { ...data, id });
    });
  }
  async getAllAirports() {
    return Array.from(this.airports.values());
  }
  async searchAirports(query) {
    const searchTerm = query.toLowerCase();
    return Array.from(this.airports.values()).filter(
      (airport) => airport.iataCode.toLowerCase().includes(searchTerm) || airport.name.toLowerCase().includes(searchTerm) || airport.city.toLowerCase().includes(searchTerm) || airport.country.toLowerCase().includes(searchTerm)
    ).slice(0, 10);
  }
  async searchAirportsExternal(query) {
    try {
      const publicResponse = await fetch(
        `https://aviation-edge.com/v2/public/autocomplete?key=demo&city=${encodeURIComponent(query)}`
      );
      if (publicResponse.ok) {
        const publicData = await publicResponse.json();
        if (publicData && publicData.cities?.length > 0) {
          const airports2 = publicData.cities.flatMap((city) => city.airports || []).map((item) => ({
            id: randomUUID(),
            iataCode: item.codeIataAirport || "",
            name: item.nameAirport || "",
            city: item.nameCity || "",
            country: item.codeIso2Country || "",
            latitude: item.latitudeAirport?.toString() || "0",
            longitude: item.longitudeAirport?.toString() || "0"
          })).filter((a) => a.iataCode).slice(0, 20);
          if (airports2.length > 0) {
            return airports2;
          }
        }
      }
      if (process.env.RAPIDAPI_KEY) {
        const response = await fetch(
          `https://aerodatabox.p.rapidapi.com/airports/search/term?q=${encodeURIComponent(query)}&limit=20`,
          {
            method: "GET",
            headers: {
              "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
              "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
            }
          }
        );
        if (response.ok) {
          const data = await response.json();
          const airports2 = data.items?.map((item) => ({
            id: randomUUID(),
            iataCode: item.iata || "",
            name: item.name || "",
            city: item.municipalityName || item.location?.city || "",
            country: item.countryCode || "",
            latitude: item.location?.lat?.toString() || "0",
            longitude: item.location?.lon?.toString() || "0"
          })).filter((a) => a.iataCode) || [];
          if (airports2.length > 0) {
            return airports2.slice(0, 20);
          }
        }
      }
      console.log("APIs externes non disponibles, utilisation de la recherche locale");
      return this.searchAirports(query);
    } catch (error) {
      console.error("Erreur lors de la recherche externe:", error);
      return this.searchAirports(query);
    }
  }
  async getAirportByCode(code) {
    return this.airports.get(code.toUpperCase());
  }
  async createFocusSession(sessionData) {
    const id = randomUUID();
    const session = {
      ...sessionData,
      id,
      startedAt: sessionData.startedAt || (/* @__PURE__ */ new Date()).toISOString(),
      completedAt: null
    };
    this.sessions.set(id, session);
    return session;
  }
  async updateFocusSession(id, update) {
    const session = this.sessions.get(id);
    if (!session) return void 0;
    const updated = {
      ...session,
      completedTasks: update.completedTasks,
      completedAt: update.completedAt || session.completedAt
    };
    this.sessions.set(id, updated);
    return updated;
  }
  async getFocusSession(id) {
    return this.sessions.get(id);
  }
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
  estimateFlightTime(distanceKm) {
    const avgSpeed = 800;
    const taxiAndClimbTime = 30;
    const flightTime = distanceKm / avgSpeed * 60;
    return Math.round(flightTime + taxiAndClimbTime);
  }
  async calculateFlightRoutes(departureCode, durationMinutes) {
    const departure = await this.getAirportByCode(departureCode);
    if (!departure) return [];
    const allAirports = await this.getAllAirports();
    const routes = [];
    const depLat = parseFloat(departure.latitude);
    const depLon = parseFloat(departure.longitude);
    for (const airport of allAirports) {
      if (airport.iataCode === departureCode) continue;
      const arrLat = parseFloat(airport.latitude);
      const arrLon = parseFloat(airport.longitude);
      const distance = this.calculateDistance(depLat, depLon, arrLat, arrLon);
      const flightTime = this.estimateFlightTime(distance);
      const timeDiff = Math.abs(flightTime - durationMinutes);
      const tolerance = durationMinutes * 0.25;
      if (timeDiff <= tolerance) {
        routes.push({
          airport,
          flightTimeMinutes: flightTime,
          distance: Math.round(distance)
        });
      }
    }
    return routes.sort((a, b) => {
      const diffA = Math.abs(a.flightTimeMinutes - durationMinutes);
      const diffB = Math.abs(b.flightTimeMinutes - durationMinutes);
      return diffA - diffB;
    }).slice(0, 12);
  }
};
var storage = new MemStorage();

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var airports = pgTable("airports", {
  id: varchar("id").primaryKey(),
  iataCode: varchar("iata_code", { length: 3 }).notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull()
});
var focusSessions = pgTable("focus_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  departureAirport: varchar("departure_airport", { length: 3 }).notNull(),
  arrivalAirport: varchar("arrival_airport", { length: 3 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  seatPosition: varchar("seat_position", { length: 20 }).notNull(),
  tasks: text("tasks").array().notNull(),
  completedTasks: text("completed_tasks").array().notNull().default(sql`ARRAY[]::text[]`),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at")
});
var insertFocusSessionSchema = createInsertSchema(focusSessions).omit({
  id: true
});
var updateFocusSessionSchema = z.object({
  completedTasks: z.array(z.string()),
  completedAt: z.string().optional()
});

// server/routes.ts
import { z as z2 } from "zod";
async function registerRoutes(app2) {
  app2.get("/api/airports", async (req, res) => {
    try {
      const query = req.query.q;
      if (query === void 0) {
        const airports3 = await storage.getAllAirports();
        return res.json(airports3);
      }
      if (query.length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }
      const airports2 = await storage.searchAirportsExternal(query);
      res.json(airports2);
    } catch (error) {
      console.error("Error searching airports:", error);
      res.status(500).json({ error: "Failed to search airports" });
    }
  });
  app2.get("/api/routes", async (req, res) => {
    try {
      const departure = req.query.departure;
      const duration = req.query.duration;
      if (!departure || !duration) {
        return res.status(400).json({ error: "Missing departure or duration parameter" });
      }
      const durationMinutes = parseInt(duration);
      if (isNaN(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
        return res.status(400).json({ error: "Duration must be between 15 and 720 minutes" });
      }
      const routes = await storage.calculateFlightRoutes(departure, durationMinutes);
      res.json(routes);
    } catch (error) {
      console.error("Error calculating routes:", error);
      res.status(500).json({ error: "Failed to calculate routes" });
    }
  });
  app2.post("/api/sessions", async (req, res) => {
    try {
      const validatedData = insertFocusSessionSchema.parse(req.body);
      const session = await storage.createFocusSession(validatedData);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });
  app2.patch("/api/sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateFocusSessionSchema.parse(req.body);
      const session = await storage.updateFocusSession(id, validatedData);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });
  app2.get("/api/sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getFocusSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      ),
      await import("@replit/vite-plugin-dev-banner").then(
        (m) => m.devBanner()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "8000", 10);
  server.listen({
    port,
    host: "127.0.0.1",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
