import type { RawSnapshotNode } from '@agent-device/kernel/snapshot';
import { normalizeType } from '@agent-device/contracts/snapshot';
import type { IosSnapshotFoldPolicy, IosSnapshotPresentationNode } from './types.ts';

const REGULAR_ELIGIBLE_TYPES = new Set([
  'button',
  'cell',
  'checkbox',
  'collectionview',
  'link',
  'menuitem',
  'picker',
  'searchfield',
  'securetextfield',
  'segmentedcontrol',
  'slider',
  'scrollview',
  'stepper',
  'switch',
  'tabbar',
  'table',
  'textfield',
  'textview',
  'webview',
]);

type ProjectionInput = Readonly<{
  nodes: readonly IosSnapshotPresentationNode[];
  projection: 'regular' | 'raw';
  scope: string | null;
  depth: number | null;
  foldPolicy: IosSnapshotFoldPolicy;
}>;

export type IosSnapshotProjectionResult = Readonly<{
  nodes: RawSnapshotNode[];
  sourceIndexes: readonly number[];
}>;

export function projectIosSnapshot(input: ProjectionInput): IosSnapshotProjectionResult {
  const scoped = scopeIosSnapshotNodes(input);
  return input.projection === 'raw'
    ? projectRawNodes(scoped, input.depth)
    : projectRegularNodes(scoped, input.depth);
}

export function projectIosQualitySnapshot(
  input: Omit<ProjectionInput, 'scope'>,
): IosSnapshotProjectionResult {
  return input.projection === 'raw'
    ? projectRawNodes(input.nodes, input.depth)
    : projectRegularNodes(input.nodes, input.depth);
}

function isEligibleForIosRegularPresentation(node: RawSnapshotNode): boolean {
  if (node.parentIndex === undefined) return true;
  return REGULAR_ELIGIBLE_TYPES.has(normalizeType(node.type ?? '')) || hasSemanticContent(node);
}

function scopeIosSnapshotNodes(input: ProjectionInput): IosSnapshotPresentationNode[] {
  const query = input.scope?.trim().toLowerCase();
  if (!query) return [...input.nodes];

  for (let start = 0; start < input.nodes.length; start += 1) {
    const candidate = input.nodes[start];
    if (!candidate || !matchesScope(candidate.raw, query)) continue;
    const range = subtreeRange(input.nodes, start);
    const contributes =
      input.projection === 'raw' ||
      range.some((position) => isEligibleForIosRegularPresentation(input.nodes[position]!.raw));
    if (!contributes) continue;

    const scoped = range.map((position) => input.nodes[position]!);
    const limited =
      input.projection === 'raw' && input.depth !== null
        ? scoped.filter((node) => rawDepth(node) - rawDepth(candidate) <= input.depth!)
        : scoped;
    return reindexScopedNodes(limited, rawDepth(candidate));
  }
  return [];
}

function projectRawNodes(
  nodes: readonly IosSnapshotPresentationNode[],
  maximumDepth: number | null,
): IosSnapshotProjectionResult {
  const selected =
    maximumDepth === null ? [...nodes] : nodes.filter((node) => rawDepth(node) <= maximumDepth);
  return {
    nodes: selected.map((node) => ({ ...node.raw, rect: node.raw.rect })),
    sourceIndexes: selected.map((node) => node.raw.index),
  };
}

function projectRegularNodes(
  sourceNodes: readonly IosSnapshotPresentationNode[],
  maximumDepth: number | null,
): IosSnapshotProjectionResult {
  const presented: RawSnapshotNode[] = [];
  const sourceIndexes: number[] = [];
  const nearestPresented = new Map<number, RawSnapshotNode>();

  for (const node of sourceNodes) {
    const parent = readNearestPresentedParent(node, nearestPresented);
    const projected = createRegularProjectedNode(node, parent, maximumDepth, presented.length);
    if (!projected) {
      rememberNearestPresented(node, parent, nearestPresented);
      continue;
    }
    presented.push(projected);
    sourceIndexes.push(node.raw.index);
    nearestPresented.set(node.raw.index, projected);
  }
  return { nodes: presented, sourceIndexes };
}

function readNearestPresentedParent(
  node: IosSnapshotPresentationNode,
  nearestPresented: ReadonlyMap<number, RawSnapshotNode>,
): RawSnapshotNode | undefined {
  return node.raw.parentIndex === undefined
    ? undefined
    : nearestPresented.get(node.raw.parentIndex);
}

function createRegularProjectedNode(
  node: IosSnapshotPresentationNode,
  parent: RawSnapshotNode | undefined,
  maximumDepth: number | null,
  index: number,
): RawSnapshotNode | undefined {
  if (!isEligibleForIosRegularPresentation(node.raw)) return undefined;
  const depth = parent ? (parent.depth ?? 0) + 1 : 0;
  if (maximumDepth !== null && depth > maximumDepth) return undefined;
  return {
    ...node.raw,
    index,
    depth,
    parentIndex: parent?.index,
    ...(node.effectiveRect ? { rect: node.effectiveRect } : { rect: undefined }),
    hittable: isProjectedNodeHittable(node),
  };
}

function isProjectedNodeHittable(node: IosSnapshotPresentationNode): boolean {
  return Boolean(
    node.raw.hittable === true &&
    node.effectiveRect &&
    node.effectiveRect.width > 0 &&
    node.effectiveRect.height > 0,
  );
}

function rememberNearestPresented(
  node: IosSnapshotPresentationNode,
  parent: RawSnapshotNode | undefined,
  nearestPresented: Map<number, RawSnapshotNode>,
): void {
  if (parent) nearestPresented.set(node.raw.index, parent);
}

function reindexScopedNodes(
  nodes: readonly IosSnapshotPresentationNode[],
  depthOffset: number,
): IosSnapshotPresentationNode[] {
  const indexMap = new Map(nodes.map((node, index) => [node.raw.index, index]));
  return nodes.map((node, index) => ({
    ...node,
    raw: {
      ...node.raw,
      index,
      depth: Math.max(0, rawDepth(node) - depthOffset),
      parentIndex:
        node.raw.parentIndex === undefined ? undefined : indexMap.get(node.raw.parentIndex),
    },
  }));
}

function matchesScope(node: RawSnapshotNode, query: string): boolean {
  return [node.label, node.identifier, node.value].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(query),
  );
}

function subtreeRange(nodes: readonly IosSnapshotPresentationNode[], start: number): number[] {
  const rootDepth = rawDepth(nodes[start]!);
  const positions: number[] = [];
  for (let position = start; position < nodes.length; position += 1) {
    if (position > start && rawDepth(nodes[position]!) <= rootDepth) break;
    positions.push(position);
  }
  return positions;
}

function rawDepth(node: IosSnapshotPresentationNode): number {
  return Math.max(0, node.raw.depth ?? 0);
}

function hasSemanticContent(node: RawSnapshotNode): boolean {
  return [node.label, node.identifier, node.value].some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}
