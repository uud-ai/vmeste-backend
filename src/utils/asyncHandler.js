// Express 5 already forwards rejected promises to the error handler on its own,
// but this wrapper is kept explicit so the code also behaves correctly if this
// project is ever downgraded to Express 4, and so every route reads the same way.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
