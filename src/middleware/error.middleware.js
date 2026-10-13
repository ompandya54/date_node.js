/**
 * 404 Handler for undefined routes
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route not found - ${req.originalUrl}`,
  });
};

/**
 * Global Error Handling Middleware
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let code = err.code || 'SERVER_ERROR';
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || undefined;

  // Handling Mongoose Duplicate Key Error (e.g. Email already exists)
  if (err.code === 11000) {
    statusCode = 422;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    errors = { [field]: `This ${field} is already registered.` };
  }

  // Handling Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    errors = {};
    Object.keys(err.errors).forEach((key) => {
      errors[key] = err.errors[key].message;
    });
    message = 'Validation failed';
  }

  // Handling Invalid Mongoose ObjectId (CastError)
  if (err.name === 'CastError') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = `Resource not found with id of ${err.value}`;
  }

  const response = {
    success: false,
    code: typeof code === 'number' ? 'SERVER_ERROR' : code,
    message,
  };

  if (errors && Object.keys(errors).length > 0) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
};
