export type UploadedMultipartFile = {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
  readonly size: number;
};

export type UploadResponse = {
  readonly contentType: string;
  readonly hash: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
};
