-- CreateEnum: SourceLanguage
CREATE TYPE "SourceLanguage" AS ENUM ('PT_BR', 'ES');

-- AlterTable: Order — add sourceLanguage with default PT_BR (backwards-compatible)
ALTER TABLE "Order" ADD COLUMN "sourceLanguage" "SourceLanguage" NOT NULL DEFAULT 'PT_BR';

-- AlterTable: Document — add optional sourceLanguage (inherits from Order if null)
ALTER TABLE "Document" ADD COLUMN "sourceLanguage" "SourceLanguage";
