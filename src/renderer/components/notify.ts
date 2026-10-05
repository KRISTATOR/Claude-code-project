import { notifications } from '@mantine/notifications';

export function notifyError(message: string): void {
  notifications.show({ color: 'red', message, autoClose: 8000 });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message, autoClose: 3000 });
}
