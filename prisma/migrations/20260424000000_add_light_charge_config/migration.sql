-- CreateTable
CREATE TABLE "light_charge_configs" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time_slots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "amount_per_slot" INTEGER NOT NULL DEFAULT 3000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "light_charge_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "light_charge_configs_date_key" ON "light_charge_configs"("date");
