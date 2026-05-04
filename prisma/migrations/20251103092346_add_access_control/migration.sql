-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAccessGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContainerAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "ContainerAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerAccess_userId_idx" ON "ContainerAccess"("userId");

-- CreateIndex
CREATE INDEX "ContainerAccess_containerName_idx" ON "ContainerAccess"("containerName");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerAccess_userId_containerName_key" ON "ContainerAccess"("userId", "containerName");

-- AddForeignKey
ALTER TABLE "ContainerAccess" ADD CONSTRAINT "ContainerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
