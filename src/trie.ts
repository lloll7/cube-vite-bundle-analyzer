export interface GroupWithNode {
    groups: Array<GroupWithNode>;
    children?: Map<string, Node>;
    filename: string;
    label: string;
    [prop: string]: any;
}