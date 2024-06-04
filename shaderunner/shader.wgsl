@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cell_state: array<u32>;

struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
};


@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
    let i = f32(input.instance);
    let cell = vec2f(i % grid.x, floor(i / grid.x));

    let state = f32(cell_state[input.instance]);

    let cell_offset = cell / grid * 2;
    let grid_pos = (input.pos*state + 1) / grid - 1 + cell_offset;

    var output: VertexOutput;
    output.pos = vec4f(grid_pos, 0, 1);
    output.cell = cell;
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.cell.x / grid.x, 0.2 * (1 - (input.cell.x + input.cell.y) / (grid.x + grid.y)), input.cell.y / grid.y, 1);
}