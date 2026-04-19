import { colorToLozenge } from '../../shared/constants';

export const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  const opts = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
};

export const makeLevelAppearance = (config) => (levelId) => {
  const level = config?.levels?.find((l) => l.id === levelId);
  return level ? colorToLozenge(level.color) : 'default';
};

export const partitionPendingJobs = (pendingJobs, asyncJob) => ({
  ownerJob: asyncJob
    ? null
    : pendingJobs.find((j) => j.isSelf || j.isAncestor) || null,
  otherJobs: asyncJob
    ? []
    : pendingJobs.filter((j) => !(j.isSelf || j.isAncestor)),
});

export const filterForLevel = (items, currentLevelId) =>
  (items || []).filter(
    (item) =>
      item.levelIds?.length === 0 || item.levelIds?.includes(currentLevelId),
  );
