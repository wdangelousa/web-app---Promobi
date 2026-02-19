-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PARCELADO_USA');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'TRANSLATOR', 'NOTARY', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'TRANSLATING', 'NOTARIZING', 'COMPLETED', 'PAID', 'READY_FOR_REVIEW', 'MANUAL_TRANSLATION_NEEDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "requiresNotarization" BOOLEAN NOT NULL DEFAULT false,
    "requiresHardCopy" BOOLEAN NOT NULL DEFAULT false,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "uspsTracking" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "deliveryUrl" TEXT,
    "metadata" TEXT,
    "paymentMethod" TEXT,
    "hasTranslation" BOOLEAN NOT NULL DEFAULT true,
    "hasNotary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "docType" TEXT NOT NULL,
    "originalFileUrl" TEXT NOT NULL,
    "translatedFileUrl" TEXT,
    "translatedText" TEXT,
    "exactNameOnDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
