import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.1.0-alpha-16";

// Function to get the viewport size at a specified depth
function getViewportSizeAtDepth(camera, depth) {
  const viewportHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(0.5 * camera.fov));
  const viewportWidth = viewportHeight * camera.aspect;
  return new THREE.Vector2(viewportWidth, viewportHeight);
}

// Function to create a mesh that covers the camera's viewport
function createCameraPlaneMesh(camera, depth, material) {
  if (camera.near > depth || depth > camera.far) {
    console.warn("Camera plane geometry will be clipped by the `camera`!");
  }
  const viewportSize = getViewportSizeAtDepth(camera, depth);
  const cameraPlaneGeometry = new THREE.PlaneGeometry(viewportSize.width, viewportSize.height);
  cameraPlaneGeometry.translate(0, 0, -depth);

  return new THREE.Mesh(cameraPlaneGeometry, material);
}

// Basic scene setup
class BasicScene {
  constructor() {
    this.height = window.innerHeight;
    this.width = (this.height * 1280) / 720;

    // Create the scene, camera, and renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.01, 5000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    document.body.appendChild(this.renderer.domElement);

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    this.scene.add(directionalLight);

    // Camera controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.camera.position.z = 0;
    this.controls.target.set(0, 0, -5);
    this.controls.update();

    // Add video background
    const video = document.getElementById("video");
    const inputFrameTexture = new THREE.VideoTexture(video);
    const inputFramesDepth = 500;
    const inputFramesPlane = createCameraPlaneMesh(
      this.camera,
      inputFramesDepth,
      new THREE.MeshBasicMaterial({ map: inputFrameTexture })
    );
    inputFramesPlane.material.side = THREE.DoubleSide; // Make it visible on both sides
    this.scene.add(inputFramesPlane);

    this.render();
    window.addEventListener("resize", this.resize.bind(this));
  }

  // Handle window resizing
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.renderer.render(this.scene, this.camera);
  }

  // Render loop
  render() {
    requestAnimationFrame(() => this.render());
    this.renderer.render(this.scene, this.camera);
  }
}

// Bracelet class to load and position the bracelet model
class Bracelet {
  constructor(url, scene) {
    this.loader = new GLTFLoader();
    this.url = url;
    this.scene = scene;
    this.braceletModel = null; // Placeholder for the bracelet model
    this.loadModel(this.url);
  }

  // Load the bracelet model
  loadModel(url) {
    this.loader.load(url, (gltf) => {
      this.braceletModel = gltf.scene; // Store the loaded model
      this.braceletModel.scale.set(0.1, 0.1, 0.1); // Scale bracelet to wrist size
      this.scene.add(this.braceletModel); // Add model to the scene
    }, undefined, (error) => {
      console.error('Error loading the bracelet model:', error);
    });
  }

  // Smoothly position the bracelet on the wrist
  placeBraceletOnWrist(wristPosition) {
    if (this.braceletModel) {
      // Smoothly transition position
      this.braceletModel.position.lerp(wristPosition, 0.5); // Adjust 0.5 to control smoothing speed
      this.braceletModel.rotation.set(0, 0, Math.PI); // Adjust rotation for proper orientation
    }
  }
}

// Variables for hand detection
let handLandmarker;
let videoElement;

// Create the basic scene
const scene = new BasicScene();

// Create the bracelet instance
const bracelet = new Bracelet("./bracelet.glb", scene.scene);

// Detect hand landmarks and update bracelet position
function detectHandLandmarks(time) {
  if (!handLandmarker) return;

  const landmarks = handLandmarker.detectForVideo(videoElement, time);
  
  if (landmarks?.[0]?.wrist) {
    const wristLandmark = landmarks[0].wrist;
    const wristPosition = new THREE.Vector3(
      (wristLandmark.x - 0.5) * scene.width, // Convert to screen coordinates
      -(wristLandmark.y - 0.5) * scene.height,
      -500 // Position in 3D space
    );

    bracelet.placeBraceletOnWrist(wristPosition); // Place bracelet on detected wrist
  } else {
    console.log("No wrist detected. Make sure the hand is in view.");
  }
}

// Handle video frame processing
function onVideoFrame(time) {
  detectHandLandmarks(time); // Call hand detection
  videoElement.requestVideoFrameCallback(onVideoFrame); // Request the next frame
}

// Stream the webcam video for hand detection
async function streamWebcamThroughHandLandmarker() {
  videoElement = document.getElementById("video");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 1280, height: 720 },
    audio: false,
  });
  videoElement.srcObject = stream; // Set video source
  videoElement.onloadedmetadata = () => videoElement.play(); // Play video
  videoElement.requestVideoFrameCallback(onVideoFrame); // Start processing video frames
}

// Run the demo and load the hand landmarker
async function runDemo() {
  await streamWebcamThroughHandLandmarker();
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.1.0-alpha-16/wasm"
  );
  handLandmarker = await HandLandmarker.createFromModelPath(
    vision,
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
  );
  
  await handLandmarker.setOptions({
    baseOptions: { delegate: "GPU" },
    runningMode: "VIDEO",
    outputHandLandmarks: true,
  });

  console.log("Finished Loading MediaPipe Model.");
}

// Start the demo
runDemo();
