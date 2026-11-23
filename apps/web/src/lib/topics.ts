import type { TopicDto } from '@/services/api';

/**
 * Index du sujet en cours : le dernier dont le début est atteint, sinon -1.
 * En voix de l'appareil, on lit passage par passage : un sujet est atteint dès
 * que le passage en cours [progress, progress + step[ contient son début
 * (seekTo se place sur ce passage, dont le début précède le sujet).
 */
export function currentTopicIndex(topics: TopicDto[], progress: number, step = 0): number {
  const EPS = 1e-6;
  let k = -1;
  topics.forEach((t, i) => {
    const reached = step > 0 ? t.startRatio < progress + step - EPS : progress >= t.startRatio - EPS;
    if (reached) k = i;
  });
  return k;
}
