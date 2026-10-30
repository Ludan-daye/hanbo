ALTER TABLE "worker_profiles"
  ADD COLUMN "encryptedResidentialAddress" TEXT,
  ADD COLUMN "hasLongTermMedication" BOOLEAN,
  ADD COLUMN "encryptedMedicationDetails" TEXT,
  ADD COLUMN "hasPersonalInsurance" BOOLEAN,
  ADD COLUMN "encryptedInsuranceDetails" TEXT,
  ADD COLUMN "encryptedPayrollBankCard" TEXT,
  ADD COLUMN "registrationCompletedAt" TIMESTAMP(3);
