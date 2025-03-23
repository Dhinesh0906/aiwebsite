require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fluentFFMPEG = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files (like images, videos, etc.)

// Function to call Hugging Face API to generate text for slides
async function generateTextFromHuggingFace(topic) {
  const apiUrl = 'https://api-inference.huggingface.co/models/gpt2'; // Replace with your model's API URL
  const headers = {
    'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
  };

  try {
    const response = await axios.post(apiUrl, {
      inputs: topic,
    }, { headers });

    console.log("Generated text:", response.data);
    return response.data.generated_text; // Assuming the API returns text in 'generated_text' field
  } catch (error) {
    console.error("Error while calling Hugging Face API:", error);
    throw error;
  }
}

// Function to generate image from text (using sharp or any other tool)
async function generateImage(text, imagePath) {
  const imageBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .text(text, 10, 10, { size: 30, font: 'Arial' }) // Customize how text is added to the image
    .toBuffer();

  await fs.promises.writeFile(imagePath, imageBuffer);
}

// Function to generate audio from text (using Google TTS or other TTS API)
async function generateAudio(text, audioPath) {
  // For example, use the Google TTS API to generate audio and save to file
  const { exec } = require('child_process');
  const googleTTS = require('google-tts-api');

  const url = googleTTS.getAudioUrl(text, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
  });

  const audioStream = await axios.get(url, { responseType: 'stream' });

  const writeStream = fs.createWriteStream(audioPath);
  audioStream.data.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

// Function to generate the final video from images and audio
function generateVideo(images, audioFiles, outputVideo) {
  fluentFFMPEG()
    .input('concat:' + images.join('|'))
    .input('concat:' + audioFiles.join('|'))
    .outputOptions('-c:v libx264', '-c:a aac')
    .output(outputVideo)
    .on('end', () => {
      console.log('Video creation finished!');
    })
    .on('error', (err) => {
      console.error('Error during video creation:', err);
    })
    .run();
}

// API route to generate video based on the topic and duration
app.post("/generate-video", async (req, res) => {
  const { topic, duration } = req.body;

  console.log("Received topic:", topic, "Duration:", duration); // Debug log

  try {
    const images = [];
    const audioFiles = [];

    // Call Hugging Face API to generate content for the slides
    const generatedText = await generateTextFromHuggingFace(topic);
    console.log("Generated text:", generatedText); // Debug log
    
    for (let i = 0; i < 5; i++) {
      const slideText = `${generatedText} - Slide ${i + 1}: ${topic}`;
      const imageFile = `public/image_${i}.png`;
      const audioFile = `public/audio_${i}.mp3`;

      await generateImage(slideText, imageFile);
      await generateAudio(slideText, audioFile);

      images.push(imageFile);
      audioFiles.push(audioFile);
    }

    const outputVideo = `public/video_${Date.now()}.mp4`;

    generateVideo(images, audioFiles, outputVideo);

    res.json({ videoUrl: `/video_${Date.now()}.mp4` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generating video" });
  }
});

// Root route for the frontend to interact
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
