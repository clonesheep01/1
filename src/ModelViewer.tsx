import { OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type ModelFile = { file: string; name: string };

type ModelSceneProps = { model: ModelFile };

function ModelScene({ model }: ModelSceneProps) {
  const loaded = useLoader(GLTFLoader, `/models/${model.file}`);
  const scene = useMemo(() => loaded.scene.clone(true), [loaded.scene]);

  useLayoutEffect(() => {
    scene.traverse(object => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    const bounds = new Box3().setFromObject(scene);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const largestSide = Math.max(size.x, size.y, size.z) || 1;
    scene.position.set(-center.x, -center.y, -center.z);
    scene.scale.setScalar(2.4 / largestSide);
  }, [scene]);

  return <primitive object={scene} />;
}

function LoadingModel() {
  return <div className="model-viewer-status">Đang tải model 3D...</div>;
}

export default function ModelViewer({ onClose }: { onClose: () => void }) {
  const [models, setModels] = useState<ModelFile[]>([]);
  const [selected, setSelected] = useState<ModelFile | null>(null);
  const [manifestError, setManifestError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/models/models.json")
      .then(response => {
        if (!response.ok) throw new Error("Không thể đọc danh sách model");
        return response.json() as Promise<ModelFile[]>;
      })
      .then(files => {
        if (!active || !Array.isArray(files)) return;
        const validFiles = files.filter(model => typeof model?.file === "string" && model.file.toLowerCase().endsWith(".glb"));
        setModels(validFiles);
        setSelected(validFiles[0] ?? null);
      })
      .catch(() => {
        if (active) setManifestError(true);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="modal-backdrop model-viewer-backdrop" onClick={onClose}>
      <section className="model-viewer-panel" onClick={event => event.stopPropagation()}>
        <header className="panel-head">
          <div><small>BỘ SƯU TẬP 3D</small><h2>Xem model sinh vật</h2></div>
          <button className="close-btn" onClick={onClose} aria-label="Đóng viewer">×</button>
        </header>
        {manifestError ? (
          <div className="model-viewer-empty"><b>Không đọc được danh sách model.</b><p>Kiểm tra lại file public/models/models.json.</p></div>
        ) : models.length === 0 ? (
          <div className="model-viewer-empty"><b>Chưa có file .glb trong dự án.</b><p>Hãy tải các file model 3D lên thư mục public/models/, sau đó thêm tên file vào models.json để chúng xuất hiện ở đây.</p><code>models.json: [{`{ "file": "flamara.glb", "name": "Flamara" }`}]</code></div>
        ) : (
          <>
            <div className="model-viewer-layout">
              <div className="model-canvas-wrap">
                {selected && <Canvas shadows camera={{ position: [0, 0.5, 4.2], fov: 38 }}>
                  <color attach="background" args={["#132b35"]} />
                  <ambientLight intensity={1.7} />
                  <directionalLight castShadow position={[4, 5, 5]} intensity={2.4} color="#fff2d2" />
                  <directionalLight position={[-4, 2, 1]} intensity={0.8} color="#7dc8ff" />
                  <Suspense fallback={null}><ModelScene model={selected} /></Suspense>
                  <OrbitControls enableDamping minDistance={1.6} maxDistance={8} enablePan={false} />
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]} receiveShadow><circleGeometry args={[1.7, 40]} /><meshStandardMaterial color="#2c574f" roughness={0.95} /></mesh>
                </Canvas>}
                {selected && <Suspense fallback={<LoadingModel />}><div className="model-viewer-hint">Kéo để xoay · Cuộn để zoom</div></Suspense>}
              </div>
              <div className="model-list">{models.map(model => <button key={model.file} className={selected?.file === model.file ? "active" : ""} onClick={() => setSelected(model)}><b>{model.name}</b><small>{model.file}</small></button>)}</div>
            </div>
          </>
        )}
        <div className="panel-foot">Model được tải trực tiếp từ thư mục public/models/ bằng Three.js GLTFLoader.</div>
      </section>
    </div>
  );
}
