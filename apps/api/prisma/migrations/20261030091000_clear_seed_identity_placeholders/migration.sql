-- Remove only known seed fixtures; real encrypted identity values are preserved.
UPDATE "worker_profiles"
SET "encryptedIdNumber" = NULL, "idNumberHash" = NULL
WHERE ("encryptedIdNumber" = 'dev-encrypted-id' AND "idNumberHash" = encode(sha256(convert_to('dev-worker-id', 'UTF8')), 'hex'))
   OR ("encryptedIdNumber" = 'dev-encrypted-id-2' AND "idNumberHash" = encode(sha256(convert_to('dev-unbound-worker-id', 'UTF8')), 'hex'))
   OR ("encryptedIdNumber" LIKE 'enc-dev-%' AND "idNumberHash" = encode(sha256(convert_to(substring("encryptedIdNumber" from 5) || '-id', 'UTF8')), 'hex'));
