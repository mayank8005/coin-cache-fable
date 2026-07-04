-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OLLAMA', 'OPENAI');

-- CreateTable
CREATE TABLE "AiSettings" (
    "userId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'OLLAMA',
    "baseUrl" TEXT NOT NULL DEFAULT 'http://host.docker.internal:11434/v1',
    "apiKeyEnc" TEXT,
    "model" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

