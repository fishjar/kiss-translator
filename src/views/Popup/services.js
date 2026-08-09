export const COLLAPSED_SERVICE_LIMIT = 2;

export function getVisibleServices(services, activeKey, showAllServices) {
  if (showAllServices || services.length <= COLLAPSED_SERVICE_LIMIT) {
    return services;
  }

  const firstServices = services.slice(0, COLLAPSED_SERVICE_LIMIT);
  if (firstServices.some(({ key }) => key === activeKey)) {
    return firstServices;
  }

  const activeService = services.find(({ key }) => key === activeKey);
  return activeService ? [services[0], activeService] : firstServices;
}
