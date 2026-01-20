
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows, Stars, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// --- UTILS FOR CUSTOM GEOMETRY ---

// Helper to calculate radius and its derivative (slope) for proper shading
const getRadiusData = (t: number) => {
  // SYMMETRICAL PROFILE WITH STRONGER CURVE
  const topRadius = 0.60;     
  const neckRadius = 0.38;    // Thinner neck (was 0.46) to increase "curve strength"
  const bottomRadius = 0.6;  // Slightly larger bottom for weight

  let radius = 0;
  let slope = 0; // dR/dt (Rate of change of radius)

  // Uses a Double-Cosine interpolation for C1 continuous smoothness at all points
  
  if (t < 0.5) {
     // Top Bulb -> Neck
     const x = t / 0.5;
     
     const blend = 0.5 * (1 + Math.cos(x * Math.PI));
     const dBlend = -0.5 * Math.PI * Math.sin(x * Math.PI); 
     
     radius = neckRadius + (topRadius - neckRadius) * blend;
     slope = (topRadius - neckRadius) * dBlend * (1 / 0.5); 
  } else {
     // Neck -> Bottom Bulb
     const x = (t - 0.5) / 0.5;
     
     const blend = 0.5 * (1 - Math.cos(x * Math.PI));
     const dBlend = 0.5 * Math.PI * Math.sin(x * Math.PI); 

     radius = neckRadius + (bottomRadius - neckRadius) * blend;
     slope = (bottomRadius - neckRadius) * dBlend * (1 / 0.5); 
  }

  return { radius, slope };
};

// Generates a tube with variable radius and integrated spherical caps
// Uses derivative-based normals for physically correct lighting on bulging surfaces
const createCappedVariableTubeGeometry = (path: THREE.Curve<THREE.Vector3>, segments: number, radialSegments: number) => {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Curve Frames
  const frames = path.computeFrenetFrames(segments, true);
  const pathLength = path.getLength();
  
  // Brand Colors for Gradient
  const colorTop = new THREE.Color('#F50071'); // Start Color: Pink
  const colorBottom = new THREE.Color('#000068'); // End Color: Deep Navy Blue

  // Helper to push vertex data
  const pushVertex = (pos: THREE.Vector3, normal: THREE.Vector3, uv: THREE.Vector2, color: THREE.Color) => {
    vertices.push(pos.x, pos.y, pos.z);
    normals.push(normal.x, normal.y, normal.z);
    uvs.push(uv.x, uv.y);
    colors.push(color.r, color.g, color.b);
  };

  // --- BODY GENERATION ---
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const { radius, slope } = getRadiusData(t);
    
    // Use getPointAt(t) which uses equidistant sampling relative to arc length
    const P = path.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const T = frames.tangents[i];
    
    const vertexColor = new THREE.Color().lerpColors(colorTop, colorBottom, t);
    
    // Calculate geometric slope effect on normal (dR/ds)
    const dr_ds = slope / pathLength; 

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);

      // Radial vector in local frame
      const rNormX = N.x * cos + B.x * sin;
      const rNormY = N.y * cos + B.y * sin;
      const rNormZ = N.z * cos + B.z * sin;

      // Position
      const px = P.x + radius * rNormX;
      const py = P.y + radius * rNormY;
      const pz = P.z + radius * rNormZ;

      // CORRECT SHADING: Tilt the normal based on the change in radius
      const nx = rNormX - dr_ds * T.x;
      const ny = rNormY - dr_ds * T.y;
      const nz = rNormZ - dr_ds * T.z;
      
      const normal = new THREE.Vector3(nx, ny, nz).normalize();

      pushVertex(
        new THREE.Vector3(px, py, pz), 
        normal, 
        new THREE.Vector2(t, v), 
        vertexColor
      );
    }
  }

  // Body Indices
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = (i + 1) * (radialSegments + 1) + j;
      const c = (i + 1) * (radialSegments + 1) + (j + 1);
      const d = i * (radialSegments + 1) + (j + 1);
      
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  // --- CAP GENERATION ---
  const generateCap = (isTop: boolean) => {
    const capSegments = 24;
    const t = isTop ? 0 : 1;
    const center = path.getPointAt(t);
    const { radius } = getRadiusData(t); 
    
    const tangent = frames.tangents[isTop ? 0 : segments].clone();
    const normal = frames.normals[isTop ? 0 : segments].clone();
    const binormal = frames.binormals[isTop ? 0 : segments].clone();
    
    if (isTop) tangent.negate(); 

    const color = isTop ? colorTop : colorBottom;
    const connectionRingIndexStart = isTop ? 0 : segments * (radialSegments + 1);
    let prevRingStart = connectionRingIndexStart;

    for (let i = 1; i <= capSegments; i++) {
      const phi = (i / capSegments) * (Math.PI / 2);
      const rRing = radius * Math.cos(phi);
      const offset = radius * Math.sin(phi); 

      const currentRingStart = vertices.length / 3;

      for (let j = 0; j <= radialSegments; j++) {
        const v = j / radialSegments;
        
        const theta = v * Math.PI * 2;
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);

        const px = center.x + (tangent.x * offset) + rRing * (normal.x * cos + binormal.x * sin);
        const py = center.y + (tangent.y * offset) + rRing * (normal.y * cos + binormal.y * sin);
        const pz = center.z + (tangent.z * offset) + rRing * (normal.z * cos + binormal.z * sin);
        
        const pos = new THREE.Vector3(px, py, pz);
        const capCenter = center; 
        const norm = new THREE.Vector3().subVectors(pos, capCenter).normalize();

        pushVertex(pos, norm, new THREE.Vector2(isTop ? 0 : 1, v), color);
      }

      for (let j = 0; j < radialSegments; j++) {
        const curr = currentRingStart + j;
        const next = currentRingStart + (j + 1);
        const prev = prevRingStart + j;
        const prevNext = prevRingStart + (j + 1);

        if (isTop) {
             indices.push(prev, curr, prevNext);
             indices.push(curr, next, prevNext);
        } else {
             indices.push(prev, prevNext, curr);
             indices.push(curr, prevNext, next);
        }
      }
      prevRingStart = currentRingStart;
    }
  };

  generateCap(true);
  generateCap(false);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  
  return geometry;
};

// --- BRAND LOGO ---
export const BrandLogo = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  const geometry = useMemo(() => {
    // Reverting to CubicBezier to give it a gentle organic "S" flow
    // while maintaining general symmetry in radius
    // Adjusted to angle the right side (bottom) downward more
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-0.3, 1, 0),    // Start (Top-Left)
      new THREE.Vector3(-0.05, 0.35, 0),    // Control 1
      new THREE.Vector3(0.4, -0.35, 0),     // Control 2 (moved right to create sharper downward curve)
      new THREE.Vector3(0.75, -1.11, 0)    // End (Bottom-Right, angled much lower)
    );
    
    return createCappedVariableTubeGeometry(curve, 128, 64);
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle floating for hero
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <group ref={groupRef} scale={1.5}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
        
        {/* THE DOT - Scaled larger, moved further left */}
        <mesh position={[-1.15, -1.1, 0]}>
          <sphereGeometry args={[0.6, 64, 64]} />
          <meshPhysicalMaterial 
            color="#F50071" 
            roughness={0.15}
            metalness={0.1}
            clearcoat={1.0}
            envMapIntensity={1.5}
            toneMapped={false}
          />
        </mesh>

        {/* THE BONE */}
        <mesh geometry={geometry}>
          <meshPhysicalMaterial 
            vertexColors={true} 
            roughness={0.15}
            metalness={0.1}
            clearcoat={1.0}
            envMapIntensity={1.5}
            side={THREE.DoubleSide}
            shadowSide={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>

      </Float>
    </group>
  );
};

interface BrandLogo3DProps {
  className?: string;
}

export const BrandLogo3D: React.FC<BrandLogo3DProps> = ({ className = '' }) => {
  return (
    <div className={`w-full h-full relative overflow-hidden ${className}`}>
      {/* Canvas wrapper - absolute positioned to respect container bounds */}
      <div className="absolute inset-0 overflow-hidden">
        <Canvas
          camera={{ position: [-0.5, 4, 10], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
        >

          {/* Lighting Setup */}
          <ambientLight intensity={0.6} />
          <spotLight position={[10, 15, 10]} angle={0.3} penumbra={1} intensity={1.5} color="#ffffff" castShadow />
          <spotLight position={[-10, -5, -5]} angle={0.5} penumbra={1} intensity={2.0} color="#5B8EF3" />
          <pointLight position={[2, 4, 2]} intensity={1.0} color="#F50071" />

          <BrandLogo />

          <Environment preset="warehouse" blur={0.6} />

          <ContactShadows
            position={[0, -3, 0]}
            opacity={0.5}
            scale={20}
            blur={2.0}
            far={4.5}
            color="#000068"
          />

          {/* Fixed Rotation Controls (No Zoom, No Pan) */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={true}
            autoRotateSpeed={2}
          />

          <Stars radius={50} depth={50} count={800} factor={4} saturation={0} fade speed={0.5} />
        </Canvas>
      </div>
    </div>
  );
};