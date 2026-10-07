import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.verify-email");

export const generateMetadata = route.generateMetadata;
export default route.Page;
