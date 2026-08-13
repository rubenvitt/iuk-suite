# Stage 1: Dependencies
FROM node:26-alpine AS deps
# pnpm über npm, NICHT über corepack: die Node-Images bündeln corepack seit Node 25
# nicht mehr, `corepack enable` scheitert dort mit exit 127 („not found"). Das traf
# beim Dependabot-Sprung 22 → 26 die deps-Stage, also den ersten Befehl des Builds.
# Die Version hier und `packageManager` in package.json sind zwei Wahrheiten — wer
# eine anhebt, hebt die andere mit an.
#
# Die Bau-Werkzeuge sind seit better-sqlite3 13.0.0 PFLICHT, nicht Vorsorge: bis
# 12.11.1 lautete das install-Skript `prebuild-install || node-gyp rebuild` und zog
# ein fertiges Binding; 13.0.2 hat weder das Skript noch die Abhängigkeit, also
# baut pnpm über die `binding.gyp` implizit aus den Quellen — und node-gyp bricht
# ohne Python mit „Could not find any Python installation to use". Das trifft JEDE
# Node-Version gleich (26, 24 und 22 gemessen), der Node-Sprung 22 → 26 daneben ist
# unschuldig. Alpine bringt keine dieser drei Pakete mit.
# Sie bleiben in dieser Stage: das kompilierte Binding wandert mit `node_modules`
# weiter, das Laufzeit-Image erbt den Werkzeugkasten nicht.
RUN apk add --no-cache python3 make g++
RUN npm i -g pnpm@11.0.9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:26-alpine AS builder
RUN npm i -g pnpm@11.0.9
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: Production runner
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/data

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone-Output (server.js + getracte node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrationen: die Boot-Instrumentation migriert cwd-relativ von /app aus.
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/portal/_db/migrations ./src/app/m/portal/_db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/qr/_db/migrations ./src/app/m/qr/_db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/feedback/_db/migrations ./src/app/m/feedback/_db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/files/_db/migrations ./src/app/m/files/_db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/lagerbuch/_db/migrations ./src/app/m/lagerbuch/_db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/aufgaben/_db/migrations ./src/app/m/aufgaben/_db/migrations
# core führt seit dem Sitzungswiderruf eine eigene Datenbank (`CORE_MIGRATIONS`).
COPY --from=builder --chown=nextjs:nodejs /app/src/core/konto/_db/migrations ./src/core/konto/_db/migrations

# (better-sqlite3 inkl. nativem Binding steckt bereits im standalone-Output —
#  in dieser Umgebung verifiziert, siehe „Pre-flight". KEIN separater COPY: der
#  pnpm-Symlink → .pnpm würde beim bare copy brechen.)

# Datenvolume. `/data/files` MUSS hier mit angelegt und übereignet werden — kein
# Test erzwingt diese Zeile: ein LEERES benanntes Volume übernimmt Eigentümer und
# Modus des Mountpunkts aus dem Image, aber nur wenn der Pfad dort existiert.
# Fehlt er, ist der Mountpunkt `0 0`, und JEDER Blob-Schreibvorgang von `files`
# scheitert, sobald `files_data:/data/files` als eigener Mount dazukommt. Weil
# `/data` selbst weiter beschreibbar bleibt, sähe das nach einem Rechte-Rätsel
# aus statt nach einer fehlenden Zeile (gemessen 30.07.2026, Docker 29.4.0).
RUN mkdir -p /data/files && chown nextjs:nodejs /data /data/files
VOLUME /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
