export const successResponse = (res, message, data = null) => {
  res.status(200).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, message, status = 400) => {
  res.status(status).json({
    success: false,
    message,
  });
};
