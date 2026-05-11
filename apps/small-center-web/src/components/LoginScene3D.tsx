import { useEffect, useRef } from "react";

declare global {
  interface Window {
    THREE?: any;
  }
}

let threeLoader: Promise<any> | null = null;

function loadThree() {
  if (window.THREE) {
    return Promise.resolve(window.THREE);
  }

  if (!threeLoader) {
    threeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
      script.async = true;
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("Unable to load Three.js"));
      document.head.appendChild(script);
    });
  }

  return threeLoader;
}

export function LoginScene3D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;

    loadThree()
      .then((THREE) => {
        const canvas = canvasRef.current;

        if (!canvas || cancelled || !THREE) {
          return;
        }

        const targetCanvas = canvas;
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          canvas: targetCanvas
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0.25, 8);

        const root = new THREE.Group();
        scene.add(root);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
        keyLight.position.set(4, 5, 5);
        scene.add(keyLight);
        scene.add(new THREE.AmbientLight(0x9dd6d1, 1.8));

        const coreMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x1fbba5,
          emissiveIntensity: 0.55,
          metalness: 0.35,
          roughness: 0.28
        });
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 2), coreMaterial);
        root.add(core);

        const ringMaterial = new THREE.MeshStandardMaterial({
          color: 0xa7f3d0,
          emissive: 0x0f7663,
          emissiveIntensity: 0.28,
          transparent: true,
          opacity: 0.58,
          metalness: 0.15,
          roughness: 0.35
        });

        const rings = [
          new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.018, 12, 96), ringMaterial),
          new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.014, 12, 120), ringMaterial.clone()),
          new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.012, 12, 140), ringMaterial.clone())
        ];

        rings[0].rotation.x = Math.PI / 2.6;
        rings[1].rotation.y = Math.PI / 2.4;
        rings[2].rotation.x = Math.PI / 2;
        rings[2].rotation.z = Math.PI / 5;
        rings.forEach((ring) => root.add(ring));

        const nodeMaterials = [
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x075985, emissiveIntensity: 0.28 }),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x92400e, emissiveIntensity: 0.25 }),
          new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0x9d174d, emissiveIntensity: 0.22 }),
          new THREE.MeshStandardMaterial({ color: 0x86efac, emissive: 0x166534, emissiveIntensity: 0.22 })
        ];

        const nodePositions = [
          new THREE.Vector3(-2.85, 1.15, 0.25),
          new THREE.Vector3(2.55, 1.35, -0.2),
          new THREE.Vector3(-1.95, -1.45, 0.35),
          new THREE.Vector3(2.25, -1.35, 0.15)
        ];

        const nodes = nodePositions.map((position, index) => {
          const geometry =
            index % 2 === 0 ? new THREE.BoxGeometry(0.42, 0.42, 0.42) : new THREE.SphereGeometry(0.27, 24, 24);
          const node = new THREE.Mesh(geometry, nodeMaterials[index]);
          node.position.copy(position);
          root.add(node);
          return node;
        });

        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xd9fff6,
          transparent: true,
          opacity: 0.56
        });
        const lines = nodes.map((node) => {
          const geometry = new THREE.BufferGeometry().setFromPoints([core.position, node.position]);
          const line = new THREE.Line(geometry, lineMaterial);
          root.add(line);
          return line;
        });

        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(150 * 3);

        for (let index = 0; index < 150; index += 1) {
          particlePositions[index * 3] = (Math.random() - 0.5) * 7.5;
          particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 4.8;
          particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 3;
        }

        particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
        const particles = new THREE.Points(
          particleGeometry,
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.025,
            transparent: true,
            opacity: 0.45
          })
        );
        root.add(particles);

        function resize() {
          const { clientWidth, clientHeight } = targetCanvas;
          renderer.setSize(clientWidth, clientHeight, false);
          camera.aspect = clientWidth / Math.max(clientHeight, 1);
          camera.updateProjectionMatrix();
        }

        let animationFrame = 0;
        const clock = new THREE.Clock();

        function animate() {
          const elapsed = clock.getElapsedTime();

          core.rotation.x = elapsed * 0.22;
          core.rotation.y = elapsed * 0.32;
          root.rotation.y = Math.sin(elapsed * 0.25) * 0.16;
          root.rotation.x = Math.sin(elapsed * 0.18) * 0.06;

          rings.forEach((ring, index) => {
            ring.rotation.z += 0.002 + index * 0.001;
            ring.scale.setScalar(1 + Math.sin(elapsed * 1.2 + index) * 0.018);
          });

          nodes.forEach((node, index) => {
            node.rotation.x += 0.006 + index * 0.001;
            node.rotation.y += 0.009;
            node.position.y = nodePositions[index].y + Math.sin(elapsed * 1.4 + index) * 0.13;
          });

          lines.forEach((line, index) => {
            line.geometry.setFromPoints([core.position, nodes[index].position]);
          });

          particles.rotation.y = elapsed * 0.03;
          resize();
          renderer.render(scene, camera);
          animationFrame = window.requestAnimationFrame(animate);
        }

        animate();

        cleanup = () => {
          window.cancelAnimationFrame(animationFrame);
          renderer.dispose();
          particleGeometry.dispose();
          core.geometry.dispose();
          coreMaterial.dispose();
          rings.forEach((ring) => {
            ring.geometry.dispose();
            ring.material.dispose();
          });
          nodes.forEach((node) => {
            node.geometry.dispose();
            node.material.dispose();
          });
          lines.forEach((line) => line.geometry.dispose());
          lineMaterial.dispose();
        };
      })
      .catch(() => {
        // The login remains fully usable if the visual scene cannot load.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="login-scene-canvas" aria-hidden="true" />;
}
