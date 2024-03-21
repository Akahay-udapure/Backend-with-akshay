import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiErrors.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, password, username } = req.body;
    if (
        [fullName, email, password, username].some(
            (field) => field?.trim() === "",
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
    });
    if (existedUser)
        throw new ApiError(409, "User with username or email already exist");

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    )
        coverImageLocalPath = req.files?.coverImage[0].path;

    if (!avatarLocalPath) throw new ApiError(400, "Avatar file is required");

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if (!avatar) throw new ApiError(400, "Avatar file is required");

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        username: username.toLowerCase(),
        password,
    });
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken",
    );
    if (!createdUser)
        throw new ApiError(500, "Something went wrong while creating user");

    return res.json({
        status: 201,
        message: "User Registered Successfully",
        createdUser,
    });
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;
    if (!(email || username)) {
        throw new ApiError(400, "Email or Username is required");
    }
    const user = await User.findOne({
        $or: [{ username }, { email }],
    });
    if (!user) throw new ApiError(400, "User does not exist");

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid)
        throw new ApiError(400, "Please enter valid password");

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken",
    );

    const { accessToken, refreshToken } =
        await generateRefreshTokenAndAccessToken(user._id);

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json({
            status: 200,
            message: "LoggedIn sucessfully",
            user: loggedInUser,
            accessToken,
            refreshToken,
        });
});

const generateRefreshTokenAndAccessToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating token");
    }
};

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1, // this removes the field from document
            },
        },
        { new: true },
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json({
            status: 200,
            message: "User Logout successfully",
        });
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
        );

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newRefreshToken } =
            await generateAccessAndRefereshTokens(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json({
                status: 200,
                message: "Token Refresh Successfully",
                accessToken,
                refreshToken: newRefreshToken,
            });
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});
export { registerUser, loginUser, logoutUser, refreshAccessToken};
