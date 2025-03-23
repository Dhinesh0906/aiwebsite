require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const sharp = require("sharp");


const app = express();
const port = 3000;

// Middleware for parsing JSON
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Frontend HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API route to generate video based on the topic
app.post("/generate-video", async (req, res) => {
  const { topic, duration } = req.body;
  console.log("Received topic:", topic, "Duration:", duration); // Debug log

  try {
    const images = [];
    const audioFiles = [];

    // Log this step
    console.log("Calling Hugging Face API...");
    const generatedText = await generateTextFromHuggingFace(topic);
    console.log("Generated text:", generatedText); // Debug log
    
    // Further logging
    for (let i = 0; i < 5; i++) {
      const slideText = `${generatedText} - Slide ${i + 1}: ${topic}`;
      console.log(`Generating image and audio for Slide ${i + 1}`);  // Debug log
      const imageFile = `public/image_${i}.png`;
      const audioFile = `public/audio_${i}.mp3`;

      await generateImage(slideText, imageFile);
      await generateAudio(slideText, audioFile);

      images.push(imageFile);
      audioFiles.push(audioFile);
    }

    console.log("Generating final video...");
    const outputVideo = `public/video_${Date.now()}.mp4`;

    generateVideo(images, audioFiles, outputVideo);

    res.json({ videoUrl: `/video_${Date.now()}.mp4` });
  } catch (error) {
    console.error("Error generating video:", error);  // Error log
    res.status(500).json({ error: "Error generating video" });
  }
});


// Function to generate text using Hugging Face API
const generateTextFromHuggingFace = async (topic) => {
  const apiKey = api.env.HUGGING_FACE_API_KEY;  

  const model = "gpt-neo-2.7B"; // You can choose the model you want

  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: `Generate structured content for the topic: ${topic}`,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    // Extract and return the generated text for use in slides
    return response.data[0].generated_text;
  } catch (error) {
    console.error("Error generating text from Hugging Face:", error);
    throw new Error("Failed to generate content from Hugging Face");
  }
};

// Function to generate images with text
const generateImage = (text, filename) => {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .text(text, 20, 50)
    .toFile(filename);
};

// Function to generate audio using Google TTS or other TTS service
const generateAudio = (text, filename) => {
  const url = googleTTS.getAudioUrl(text, {
    lang: "en",
    slow: false,
    host: "https://translate.google.com",
  });

  return axios
    .get(url, { responseType: "stream" })
    .then((response) => {
      const writer = fs.createWriteStream(filename);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    });
};

// Function to generate video from images and audio
const generateVideo = (imageFiles, audioFiles, outputVideo) => {
  const ffmpegCommand = ffmpeg();

  // Add images to video
  imageFiles.forEach((image) => {
    ffmpegCommand.input(image);
  });

  // Add audio to video
  ffmpegCommand.input(audioFiles[0]); // Assuming only one audio file

  ffmpegCommand
    .output(outputVideo)
    .outputOptions("-vcodec libx264", "-acodec aac", "-preset fast", "-crf 23")
    .on("end", () => {
      console.log("Video generation completed!");
    })
    .on("error", (err) => {
      console.error("Error generating video:", err);
    })
    .run(); // <-- This is where you might have missed a closing parenthesis
};

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
