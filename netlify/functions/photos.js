require("dotenv").config();

const CLOUD_NAME = process.env.CLOUD_NAME;
const API_KEY    = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const AUTH_HEADER =
  "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");

const CLOUDINARY = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;
const ROOT_FOLDER = "España";

exports.handler = async (event) => {
  try {
    const folder = event.queryStringParameters.folder;

    const prefix = encodeURIComponent(`${ROOT_FOLDER}/${folder}/`);

    const url = `${CLOUDINARY}/resources/image/upload?prefix=${prefix}&max_results=500`;

    const res = await fetch(url, {
      headers: { Authorization: AUTH_HEADER }
    });

    const data = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data.resources || [])
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};