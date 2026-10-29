export class ContentValidationError extends Error {
  constructor(code, message, { file } = {}) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'ContentValidationError';
    this.code = code;
    this.file = file ?? null;
  }
}
