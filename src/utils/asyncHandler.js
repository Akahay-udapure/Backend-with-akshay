const asyncHandler = (requetHandler) => {
    return (req, res, next) => {
        Promise.resolve(requetHandler(req, res, next)).catch((err) =>
            next(err),
        );
    };
};

export { asyncHandler };
