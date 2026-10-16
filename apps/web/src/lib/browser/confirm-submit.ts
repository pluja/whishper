export function confirmSubmit(message: string): (event: SubmitEvent) => void {
  return (event) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}
