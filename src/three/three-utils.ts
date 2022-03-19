/* eslint-disable guard-for-in */
import { BufferAttribute, BufferGeometry } from 'three';

function mergeBufferAttributes(attributes: BufferAttribute[]): BufferAttribute {
  let TypedArray;
  let itemSize;
  let normalized;
  let arrayLength = 0;

  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];

    if ((attribute as any).isInterleavedBufferAttribute) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. InterleavedBufferAttributes are not supported.');
      return null;
    }

    if (TypedArray === undefined) TypedArray = attribute.array.constructor;
    if (TypedArray !== attribute.array.constructor) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.');
      return null;
    }

    if (itemSize === undefined) itemSize = attribute.itemSize;
    if (itemSize !== attribute.itemSize) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.');
      return null;
    }

    if (normalized === undefined) normalized = attribute.normalized;
    if (normalized !== attribute.normalized) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.');
      return null;
    }

    arrayLength += attribute.array.length;
  }

  // @ts-ignore
  const array = new TypedArray(arrayLength);
  let offset = 0;

  for (let i = 0; i < attributes.length; ++i) {
    array.set(attributes[i].array, offset);

    offset += attributes[i].array.length;
  }

  return new BufferAttribute(array, itemSize, normalized);
}

export function mergeBufferGeometries(geometries: BufferGeometry[], useGroups = false): BufferGeometry {
  const isIndexed = geometries[0].index !== null;
  const attributesUsed = new Set(Object.keys(geometries[0].attributes));
  const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
  const attributes = {};
  const morphAttributes = {};
  const morphTargetsRelative = geometries[0].morphTargetsRelative;
  const mergedGeometry = new BufferGeometry();
  let offset = 0;

  for (let i = 0; i < geometries.length; ++i) {
    const geometry = geometries[i];
    let attributesCount = 0;

    // ensure that all geometries are indexed, or none

    if (isIndexed !== (geometry.index !== null)) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.');
      return null;
    }

    // gather attributes, exit early if they're different
    for (const name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.');
        return null;
      }

      if ((attributes as any)[name] === undefined)
        (attributes as any)[name] = [];

      (attributes as any)[name].push(geometry.attributes[name]);

      attributesCount++;
    }

    // ensure geometries have the same number of attributes

    if (attributesCount !== attributesUsed.size) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. Make sure all geometries have the same number of attributes.');
      return null;
    }

    // gather morph attributes, exit early if they're different

    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. .morphTargetsRelative must be consistent throughout all geometries.');
      return null;
    }

    for (const name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '.  .morphAttributes must be consistent throughout all geometries.');
        return null;
      }

      if ((morphAttributes as any)[name] === undefined)
        (morphAttributes as any)[name] = [];

      (morphAttributes as any)[name].push(geometry.morphAttributes[name]);
    }

    // gather .userData
    (mergedGeometry.userData as any).mergedUserData = (mergedGeometry.userData as any).mergedUserData || [];
    (mergedGeometry.userData as any).mergedUserData.push(geometry.userData);

    if (useGroups) {
      let count;

      if (isIndexed) {
        count = geometry.index.count;
      }
      else if ((geometry.attributes as any).position !== undefined) {
        count = (geometry.attributes as any).position.count;
      }
      else {
        console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed with geometry at index ' + i + '. The geometry must have either an index or a position attribute');
        return null;
      }

      mergedGeometry.addGroup(offset, count, i);

      offset += count;
    }
  }

  // merge indices

  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndex = [];

    for (let i = 0; i < geometries.length; ++i) {
      const index = geometries[i].index;

      for (let j = 0; j < index.count; ++j) {
        mergedIndex.push(index.getX(j) + indexOffset);
      }

      indexOffset += (geometries[i].attributes as any).position.count;
    }

    mergedGeometry.setIndex(mergedIndex);
  }

  // merge attributes

  for (const name in attributes) {
    const mergedAttribute = mergeBufferAttributes((attributes as any)[name]);

    if (!mergedAttribute) {
      console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed while trying to merge the ' + name + ' attribute.');
      return null;
    }

    mergedGeometry.setAttribute(name, mergedAttribute);
  }

  // merge morph attributes

  for (const name in morphAttributes) {
    const numMorphTargets = (morphAttributes as any)[name][0].length;

    if (numMorphTargets === 0) break;

    mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
    mergedGeometry.morphAttributes[name] = [];

    for (let i = 0; i < numMorphTargets; ++i) {
      const morphAttributesToMerge = [];

      for (let j = 0; j < (morphAttributes as any)[name].length; ++j) {
        morphAttributesToMerge.push((morphAttributes as any)[name][j][i]);
      }

      const mergedMorphAttribute = mergeBufferAttributes(morphAttributesToMerge);

      if (!mergedMorphAttribute) {
        console.error('THREE.BufferGeometryUtils: .mergeBufferGeometries() failed while trying to merge the ' + name + ' morphAttribute.');
        return null;
      }

      mergedGeometry.morphAttributes[name].push(mergedMorphAttribute);
    }
  }

  return mergedGeometry;
}
