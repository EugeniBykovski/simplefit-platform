import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.home");

export const generateMetadata = route.generateMetadata;
export default route.Page;
