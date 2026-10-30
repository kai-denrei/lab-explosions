// Transpiled from lab-creatures src/cutis/creature/material.ts (GPL-3.0); see ../UPSTREAM.md
import * as THREE from 'three';
import vertexShader from './shaders/membrane.vert.glsl.js';
import fragmentShader from './shaders/membrane.frag.glsl.js';
export function createMembraneMaterial(config, core = false, low = false) {
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: !core, depthWrite: core, side: core || low ? THREE.FrontSide : THREE.DoubleSide, uniforms: {
            uRoll: { value: config.rollVariant }, uLaunchHeight: { value: config.launchHeight },
            uOpacity: { value: config.membraneOpacity }, uHardRadius: { value: config.coreShape > 0 ? config.coreSize : 0 },
            uSeekSweep: { value: config.seekSweep }, uSeekRate: { value: config.seekRate }, uAcceleration: { value: config.transferAcceleration }, uTime: { value: 0 }, uRadius: { value: config.r0 }, uNoise: { value: config.noiseAmp }, uBreath: { value: config.breathRate }, uRestCube: { value: config.cubenessRest }, uCap: { value: config.capAngle }, uNeck: { value: config.neckThin }, uDelay: { value: config.delaySpread }, uCore: { value: core ? 1 : 0 }, uForceCube: { value: 0 }, uPulse: { value: config.pulseSpeed }, uVeinWidth: { value: config.veinWidth }, uSkin: { value: new THREE.Color(config.skinTint) }, uVein: { value: new THREE.Color(config.veinTint) }, uGlow: { value: new THREE.Color(config.pulseTint) }, uDebug: { value: 0 }, uLow: { value: low ? 1 : 0 },
        } });
    material.forceSinglePass = low || core;
    return material;
}
export function updateMaterial(material, config, time, debug = 0, force = false) {
    const u = material.uniforms;
    u.uRoll.value = config.rollVariant;
    u.uLaunchHeight.value = config.launchHeight;
    u.uOpacity.value = config.membraneOpacity;
    u.uHardRadius.value = config.coreShape > 0 ? config.coreSize : 0;
    u.uSeekSweep.value = config.seekSweep;
    u.uSeekRate.value = config.seekRate;
    u.uAcceleration.value = config.transferAcceleration;
    u.uTime.value = time;
    u.uRadius.value = config.r0;
    u.uNoise.value = config.noiseAmp;
    u.uBreath.value = config.breathRate;
    u.uRestCube.value = config.cubenessRest;
    u.uCap.value = config.capAngle;
    u.uNeck.value = config.neckThin;
    u.uDelay.value = config.delaySpread;
    u.uPulse.value = config.pulseSpeed;
    u.uVeinWidth.value = config.veinWidth;
    u.uSkin.value.setHex(config.skinTint);
    u.uVein.value.setHex(config.veinTint);
    u.uGlow.value.setHex(config.pulseTint);
    u.uDebug.value = debug;
    u.uForceCube.value = force ? 1 : 0;
}
