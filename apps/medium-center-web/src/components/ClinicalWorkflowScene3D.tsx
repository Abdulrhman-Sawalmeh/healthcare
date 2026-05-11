import { useEffect, useRef } from "react";

declare global {
  interface Window {
    THREE?: any;
  }
}

let workflowThreeLoader: Promise<any> | null = null;

function loadThree() {
  if (window.THREE) {
    return Promise.resolve(window.THREE);
  }

  if (!workflowThreeLoader) {
    workflowThreeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
      script.async = true;
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("Unable to load Three.js"));
      document.head.appendChild(script);
    });
  }

  return workflowThreeLoader;
}

interface ClinicalWorkflowScene3DProps {
  variant: "visits" | "referrals";
}

export function ClinicalWorkflowScene3D({ variant }: ClinicalWorkflowScene3DProps) {
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
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(0, 0.45, 7.8);

        const root = new THREE.Group();
        scene.add(root);

        scene.add(new THREE.AmbientLight(0xffffff, 1.4));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(4, 5, 5);
        scene.add(keyLight);

        const palette =
          variant === "referrals"
            ? {
                core: 0x38bdf8,
                coreEmissive: 0x075985,
                ring: 0xf59e0b,
                nodeA: 0x0f7663,
                nodeB: 0xf97316,
                line: 0xfff4d6
              }
            : {
                core: 0x14b8a6,
                coreEmissive: 0x115e59,
                ring: 0x60a5fa,
                nodeA: 0xf472b6,
                nodeB: 0x22c55e,
                line: 0xe0f7f4
              };

        const coreMaterial = new THREE.MeshStandardMaterial({
          color: palette.core,
          emissive: palette.coreEmissive,
          emissiveIntensity: 0.35,
          metalness: 0.35,
          roughness: 0.25
        });
        const core =
          variant === "referrals"
            ? new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 2), coreMaterial)
            : new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 2), coreMaterial);
        root.add(core);

        const ringMaterial = new THREE.MeshStandardMaterial({
          color: palette.ring,
          emissive: palette.ring,
          emissiveIntensity: 0.14,
          transparent: true,
          opacity: 0.55,
          metalness: 0.2,
          roughness: 0.35
        });

        const rings = [
          new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.018, 12, 96), ringMaterial),
          new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.014, 12, 120), ringMaterial.clone()),
          new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.012, 12, 140), ringMaterial.clone())
        ];
        rings[0].rotation.x = Math.PI / 2.5;
        rings[1].rotation.y = Math.PI / 2.4;
        rings[2].rotation.x = Math.PI / 2;
        rings[2].rotation.z = Math.PI / 5;
        rings.forEach((ring) => root.add(ring));

        const nodeMaterialA = new THREE.MeshStandardMaterial({
          color: palette.nodeA,
          emissive: palette.nodeA,
          emissiveIntensity: 0.18,
          metalness: 0.18,
          roughness: 0.3
        });
        const nodeMaterialB = new THREE.MeshStandardMaterial({
          color: palette.nodeB,
          emissive: palette.nodeB,
          emissiveIntensity: 0.14,
          metalness: 0.2,
          roughness: 0.28
        });

        const positions =
          variant === "referrals"
            ? [
                new THREE.Vector3(-2.65, 0.98, 0.15),
                new THREE.Vector3(2.72, 0.88, -0.1),
                new THREE.Vector3(-1.85, -1.35, 0.22),
                new THREE.Vector3(1.95, -1.45, 0.18)
              ]
            : [
                new THREE.Vector3(-2.55, 1.2, 0.2),
                new THREE.Vector3(2.55, 1.15, -0.16),
                new THREE.Vector3(-2.15, -1.22, 0.15),
                new THREE.Vector3(2.08, -1.32, 0.28)
              ];

        const nodes = positions.map((position, index) => {
          const geometry =
            variant === "referrals" && index < 2
              ? new THREE.BoxGeometry(0.52, 0.52, 0.52)
              : new THREE.SphereGeometry(0.28, 24, 24);
          const node = new THREE.Mesh(geometry, index % 2 === 0 ? nodeMaterialA : nodeMaterialB);
          node.position.copy(position);
          root.add(node);
          return node;
        });

        const lineMaterial = new THREE.LineBasicMaterial({
          color: palette.line,
          transparent: true,
          opacity: 0.62
        });
        const lines = nodes.map((node) => {
          const geometry = new THREE.BufferGeometry().setFromPoints([core.position, node.position]);
          const line = new THREE.Line(geometry, lineMaterial);
          root.add(line);
          return line;
        });

        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(130 * 3);
        for (let index = 0; index < 130; index += 1) {
          particlePositions[index * 3] = (Math.random() - 0.5) * 7;
          particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 4.4;
          particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 3;
        }
        particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
        const particles = new THREE.Points(
          particleGeometry,
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.025,
            transparent: true,
            opacity: 0.5
          })
        );
        root.add(particles);

        function resize() {
          const width = targetCanvas.clientWidth || 1;
          const height = targetCanvas.clientHeight || 1;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const clock = new THREE.Clock();
        let animationFrame = 0;

        function renderFrame() {
          const elapsed = clock.getElapsedTime();

          core.rotation.x = elapsed * 0.22;
          core.rotation.y = elapsed * 0.34;
          root.rotation.y = Math.sin(elapsed * 0.25) * 0.18;
          root.rotation.x = Math.sin(elapsed * 0.2) * 0.06;

          rings.forEach((ring, index) => {
            ring.rotation.z += 0.002 + index * 0.001;
            ring.scale.setScalar(1 + Math.sin(elapsed * 1.25 + index) * 0.018);
          });

          nodes.forEach((node, index) => {
            node.rotation.x += 0.007 + index * 0.001;
            node.rotation.y += 0.009;
            node.position.y = positions[index].y + Math.sin(elapsed * 1.35 + index) * 0.12;
          });

          lines.forEach((line, index) => {
            line.geometry.setFromPoints([core.position, nodes[index].position]);
          });

          particles.rotation.y = elapsed * 0.035;
          resize();
          renderer.render(scene, camera);

          if (!reducedMotion) {
            animationFrame = window.requestAnimationFrame(renderFrame);
          }
        }

        renderFrame();

        cleanup = () => {
          window.cancelAnimationFrame(animationFrame);
          renderer.dispose();
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
          nodeMaterialA.dispose();
          nodeMaterialB.dispose();
          particleGeometry.dispose();
          particles.material.dispose();
        };
      })
      .catch(() => {
        // The page remains fully usable if the visual scene cannot load.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="clinical-workflow-canvas" aria-hidden="true" />;
}
