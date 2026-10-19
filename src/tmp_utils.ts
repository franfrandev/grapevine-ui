export function uint8ArrayStartsWith(buf: Uint8Array, slice: Uint8Array) {
    if (buf.byteLength < slice.byteLength) return false;
    for (let i = 0; i != slice.byteLength; i++) {
        if (buf[i] != slice[i]) return false;
    }
    return true;
}

export function update(element: HTMLElement, newContent: string) {
    if (element.innerHTML !== newContent) {
        element.innerHTML = newContent
    }
}
