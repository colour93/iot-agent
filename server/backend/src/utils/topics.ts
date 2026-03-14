export type TopicRoute = {
  deviceId: string;
  homeId?: string;
  roomId?: string;
};

export type InboundTopicKind =
  | 'register'
  | 'telemetry'
  | 'event'
  | 'commandAck'
  | 'lwtStatus'
  | 'unknown';

export type ParsedInboundTopic = {
  kind: InboundTopicKind;
  suffix: string;
  deviceId: string;
  homeId?: string;
  roomId?: string;
  eventType?: string;
  scheme: 'legacy' | 'hierarchical';
};

export function legacyBaseTopic(deviceId: string) {
  return `device/${deviceId}`;
}

export function hierarchicalBaseTopic(homeId: string, roomId: string, deviceId: string) {
  return `home/${homeId}/room/${roomId}/device/${deviceId}`;
}

export function baseTopic(route: TopicRoute) {
  if (route.homeId && route.roomId) {
    return hierarchicalBaseTopic(route.homeId, route.roomId, route.deviceId);
  }
  return legacyBaseTopic(route.deviceId);
}

export function topicOf(route: string | TopicRoute, suffix: string) {
  const normalizedRoute = typeof route === 'string' ? { deviceId: route } : route;
  return `${baseTopic(normalizedRoute)}/${suffix}`;
}

export function topicCandidates(route: TopicRoute, suffix: string) {
  const topics = [topicOf(route.deviceId, suffix)];
  if (route.homeId && route.roomId) {
    topics.push(topicOf(route, suffix));
  }
  return [...new Set(topics)];
}

export function parseInboundTopic(topic: string): ParsedInboundTopic | null {
  const parts = topic.split('/').filter(Boolean);

  if (parts.length >= 3 && parts[0] === 'device') {
    const deviceId = parts[1];
    const suffix = parts.slice(2).join('/');
    return classifyInboundTopic({
      suffix,
      deviceId,
      scheme: 'legacy',
    });
  }

  if (
    parts.length >= 7 &&
    parts[0] === 'home' &&
    parts[2] === 'room' &&
    parts[4] === 'device'
  ) {
    const homeId = parts[1];
    const roomId = parts[3];
    const deviceId = parts[5];
    const suffix = parts.slice(6).join('/');
    return classifyInboundTopic({
      suffix,
      deviceId,
      homeId,
      roomId,
      scheme: 'hierarchical',
    });
  }

  return null;
}

function classifyInboundTopic(
  input: Omit<ParsedInboundTopic, 'kind' | 'eventType'>,
): ParsedInboundTopic {
  if (input.suffix === 'register') {
    return { ...input, kind: 'register' };
  }
  if (input.suffix === 'telemetry') {
    return { ...input, kind: 'telemetry' };
  }
  if (input.suffix.startsWith('event/')) {
    const eventType = input.suffix.slice('event/'.length);
    return { ...input, kind: 'event', eventType: eventType || undefined };
  }
  if (input.suffix === 'command/ack') {
    return { ...input, kind: 'commandAck' };
  }
  if (input.suffix === 'lwt/status') {
    return { ...input, kind: 'lwtStatus' };
  }
  return { ...input, kind: 'unknown' };
}
