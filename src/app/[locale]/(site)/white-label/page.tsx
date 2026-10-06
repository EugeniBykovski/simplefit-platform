import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.white-label");

export const generateMetadata = route.generateMetadata;
export default route.Page;
