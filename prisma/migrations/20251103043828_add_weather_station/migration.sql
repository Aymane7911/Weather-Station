CREATE TABLE "WeatherStation" (
    "id"            TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "displayName"   TEXT,
    "lat"           DOUBLE PRECISION,
    "lng"           DOUBLE PRECISION,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherStation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeatherStation_containerName_key" ON "WeatherStation"("containerName");
CREATE INDEX "WeatherStation_containerName_idx" ON "WeatherStation"("containerName");