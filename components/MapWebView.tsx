import React, { type ComponentType } from "react";
import {
  WebView as NativeWebView,
  type WebViewProps,
} from "react-native-webview";

export type MapWebViewHandle = Pick<NativeWebView, "injectJavaScript">;

type MapWebViewProps = WebViewProps & React.RefAttributes<MapWebViewHandle>;

const NativeMapWebView = NativeWebView as unknown as ComponentType<MapWebViewProps>;

export function MapWebView(props: MapWebViewProps) {
  return <NativeMapWebView {...props} />;
}
