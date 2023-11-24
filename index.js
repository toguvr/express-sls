require('@tensorflow/tfjs-node');
const serverless = require('serverless-http');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const canvas = require('canvas');
const faceapi = require('@vladmandic/face-api');
const tmpFolder = path.resolve(__dirname, '.', 'tmp');

const upload = multer({
  storage: multer.diskStorage({
    destination: tmpFolder,
    filename(request, file, callback) {
      const fileHash = new Date().getTime().toString(36);
      const fileName = `${fileHash}-${file.originalname}`;

      return callback(null, fileName);
    },
  }),
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/', (req, res, next) => {
  return res.status(200).json({
    message: 'Hello from root!',
  });
});

app.post('/', upload.single('image'), async (req, res, next) => {
  try {
    // const MODEL_URL = 'https://togu.s3.sa-east-1.amazonaws.com/weights';
    const MODEL_URL = './model';
    console.log('passei', 0);

    const { Canvas, Image, ImageData } = canvas;
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
    console.log('passei', 1);

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL);
    const isFaceDetectionModelLoaded = faceapi.nets.ssdMobilenetv1.isLoaded;

    if (!isFaceDetectionModelLoaded) {
      throw new Error('Não carregou');
    }
    console.log('passei', 2);
    // export const faceDetectionNet = tinyFaceDetector

    // SsdMobilenetv1Options
    const minConfidence = 0.5;

    // TinyFaceDetectorOptions

    function getFaceDetectorOptions(net) {
      return new faceapi.SsdMobilenetv1Options({ minConfidence });
    }

    console.log('passei', 3);
    const faceDetectionOptions = getFaceDetectorOptions();
    const compareUrl = req?.body?.compareUrl;
    const avatarFilename = req?.file?.filename;
    const avatar_url = compareUrl;
    const originalPath = path.resolve(tmpFolder, avatarFilename);
    const referenceImage = await canvas.loadImage(avatar_url);

    const queryImage = await canvas.loadImage(originalPath);

    console.log('passei', 4);
    const resultsRef = await faceapi.detectAllFaces(
      referenceImage,
      faceDetectionOptions
    );
    const resultsQuery = await faceapi.detectAllFaces(
      queryImage,
      faceDetectionOptions
    );

    const faceImages1 = await faceapi.extractFaces(referenceImage, resultsRef);
    const faceImages2 = await faceapi.extractFaces(queryImage, resultsQuery);

    console.log('passei', 5);
    let distance = 1;

    if (faceImages1.length > 0 && faceImages2.length > 0) {
      const fim1 = await faceapi.computeFaceDescriptor(faceImages1[0]);
      const fim2 = await faceapi.computeFaceDescriptor(faceImages2[0]);

      console.log('passei', 6);
      distance = faceapi.utils.round(faceapi.euclideanDistance(fim1, fim2));
    } else {
      throw new Error('Sem rosto');
    }
    await fs.promises.unlink(originalPath);

    return res.json({ distance, samePerson: distance < 0.5 });
  } catch (err) {
    console.log(err);
    const avatarFilename = req?.file?.filename;
    if (avatarFilename) {
      const originalPath = path.resolve(tmpFolder, avatarFilename);

      await fs.promises.unlink(originalPath);
    }

    next(err);
  }
});

app.use((req, res, next) => {
  const error = new Error('Not found');
  error.status = 404;
  next(error);
});
// npm install Automattic/node-canvas#m1
// github:Automattic/node-canvas#198080580a0e3938c48daae357b88a1638a9ddcd
// npm install canvas@github:Automattic/node-canvas#198080580a0e3938c48daae357b88a1638a9ddcd
app.use((error, req, res, next) => {
  console.log(error);
  res.status(error.status || 500).send({
    error: {
      status: error.status || 500,
      message: error.message || 'Internal Server Error',
    },
  });
});

module.exports.handler = serverless(app);
