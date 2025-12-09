export function baseTopic(deviceId: string) {
  return `device/${deviceId}`;
}

export function topicOf(
  deviceId: string,
  suffix: string,
) {
  return `${baseTopic(deviceId)}/${suffix}`;
}

