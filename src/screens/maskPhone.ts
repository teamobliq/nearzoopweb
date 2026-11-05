export function maskPhone(digits: string): string {
  return `+91 ${digits.slice(0, 5)} ••• ${digits.slice(-2)}`
}
